package main

import (
	"context"
	"crypto/ecdsa"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/mikrotik-saas/agent/internal/config"
	"github.com/mikrotik-saas/agent/internal/protocol"
	"github.com/mikrotik-saas/agent/internal/routeros"
	"github.com/mikrotik-saas/agent/internal/tunnel"
	"github.com/mikrotik-saas/agent/internal/updater"
)

// Version is injected at build time via -ldflags="-X main.Version=<tag>".
// The fallback "dev" indicates a local build without version tagging.
var Version = "dev"

func main() {
	// Parse command-line flags.
	configPath := flag.String("config", "/etc/mikrotik-agent/config.json", "path to agent config file")
	enrollToken := flag.String("enroll-token", "", "one-time enrollment token (triggers enrollment flow)")
	logLevel := flag.String("log-level", "info", "log level: trace|debug|info|warn|error")
	cloudURL := flag.String("cloud-url", "", "cloud WebSocket base URL (required during enrollment)")
	jsonLog := flag.Bool("json-log", false, "emit JSON log lines (default: pretty console output)")
	flag.Parse()

	// Configure zerolog.
	logger := buildLogger(*logLevel, *jsonLog)
	log.Logger = logger

	logger.Info().
		Str("version", Version).
		Str("config", *configPath).
		Msg("MikroTik SaaS agent starting")

	if *enrollToken != "" {
		if err := runEnrollment(*enrollToken, *cloudURL, *configPath, logger); err != nil {
			logger.Fatal().Err(err).Msg("enrollment failed")
		}
		logger.Info().Msg("enrollment complete — restarting in normal mode")
		// After enrollment the config is written; restart to pick it up cleanly.
		if err := syscall.Exec(os.Args[0], []string{os.Args[0], "--config", *configPath}, os.Environ()); err != nil {
			logger.Fatal().Err(err).Msg("exec restart after enrollment failed")
		}
		return
	}

	// Normal operating mode.
	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to load config")
	}
	cfg.Version = Version

	if err := runAgent(cfg, logger); err != nil {
		logger.Fatal().Err(err).Msg("agent exited with error")
	}
}

// runAgent is the primary operating mode. It connects to RouterOS, connects
// to the cloud, and runs all subsystems until a shutdown signal is received.
func runAgent(cfg *config.AgentConfig, logger zerolog.Logger) error {
	// Root context — cancelled by OS signal.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Catch SIGINT and SIGTERM for graceful shutdown.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// --- RouterOS client ---
	rosAddr := fmt.Sprintf("%s:%d", cfg.RouterOSHost, cfg.RouterOSPort)
	rosClient := routeros.NewClient(rosAddr, cfg.RouterOSUsername, cfg.RouterOSPasswordEnc, logger)
	if err := rosClient.Connect(); err != nil {
		return fmt.Errorf("connect to RouterOS: %w", err)
	}
	defer rosClient.Close()
	logger.Info().Str("address", rosAddr).Msg("connected to RouterOS API")

	// --- Tunnel client ---
	tunnelClient, err := tunnel.ConnectWithRetry(ctx, cfg, logger)
	if err != nil {
		return fmt.Errorf("connect to cloud: %w", err)
	}
	defer tunnelClient.Close()

	// --- Metric collector ---
	metricInterval := time.Duration(cfg.MetricIntervalSeconds) * time.Second
	metricCh := make(chan protocol.MetricPush, 8)
	collector := routeros.NewMetricCollector(rosClient, metricInterval, cfg.DeviceID, metricCh, logger)

	// --- Command executor ---
	executor := routeros.NewExecutor(rosClient, logger)

	// --- Parse cloud public key for command verification ---
	cloudPubKey, err := protocol.ParseECDSAPublicKey(cfg.CloudPublicKey)
	if err != nil {
		return fmt.Errorf("parse cloud public key: %w", err)
	}

	// --- Self-updater (optional — only if UpdateURL is set) ---
	// The updater runs once shortly after startup and then every 6 hours.
	var upd *updater.Updater
	// UpdateURL is not in the current config struct; guard with empty check so
	// we can add it later without breaking existing configs.
	// upd = updater.New(cfg.Version, cfg.UpdateURL, logger)

	// Start subsystems.
	go collector.Start(ctx)
	go metricForwardLoop(ctx, cfg, metricCh, tunnelClient, logger)
	go dispatchLoop(ctx, cfg, tunnelClient, executor, cloudPubKey, logger)

	if upd != nil {
		go periodicUpdate(ctx, upd, logger)
	}

	logger.Info().Msg("agent running — press Ctrl-C to stop")

	// Block until signal or context cancellation.
	select {
	case sig := <-sigCh:
		logger.Info().Str("signal", sig.String()).Msg("received shutdown signal")
	case <-ctx.Done():
	}

	logger.Info().Msg("shutting down gracefully")

	// Give subsystems a moment to flush.
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	cancel() // signal all goroutines to exit

	// Wait briefly for the context deadline.
	<-shutdownCtx.Done()

	logger.Info().Msg("agent stopped")
	return nil
}

// metricForwardLoop reads MetricPush values produced by the collector and
// wraps them in Envelopes for transmission to the cloud.
func metricForwardLoop(
	ctx context.Context,
	_ *config.AgentConfig,
	metricCh <-chan protocol.MetricPush,
	client *tunnel.TunnelClient,
	logger zerolog.Logger,
) {
	log := logger.With().Str("goroutine", "metric_forward").Logger()
	for {
		select {
		case <-ctx.Done():
			return
		case push := <-metricCh:
			env, err := encodeEnvelope(protocol.TypeMetricPush, newID(), push)
			if err != nil {
				log.Error().Err(err).Msg("failed to encode metric envelope")
				continue
			}
			if err := client.Send(env); err != nil {
				log.Warn().Err(err).Msg("metric send failed")
			}
		}
	}
}

// dispatchLoop reads inbound Envelopes from the tunnel and routes them to
// the appropriate handler.
func dispatchLoop(
	ctx context.Context,
	cfg *config.AgentConfig,
	client *tunnel.TunnelClient,
	executor *routeros.Executor,
	cloudPubKey *ecdsa.PublicKey,
	logger zerolog.Logger,
) {
	dlog := logger.With().Str("goroutine", "dispatch").Logger()
	for {
		select {
		case <-ctx.Done():
			return
		case env := <-client.MsgChan():
			handleEnvelope(cfg, env, client, executor, cloudPubKey, dlog)
		}
	}
}

// handleEnvelope routes a single inbound Envelope to its handler.
// cloudPubKey is used to verify ECDSA signatures on CommandRequests.
func handleEnvelope(
	cfg *config.AgentConfig,
	env protocol.Envelope,
	client *tunnel.TunnelClient,
	executor *routeros.Executor,
	cloudPubKey *ecdsa.PublicKey,
	logger zerolog.Logger,
) {
	switch env.Type {
	case protocol.TypeCommandRequest:
		var cmd protocol.CommandRequest
		if err := msgpack.Unmarshal(env.Payload, &cmd); err != nil {
			logger.Error().Err(err).Str("id", env.ID).Msg("failed to decode command request")
			return
		}

		// Reject commands whose signature cannot be verified against the cloud
		// public key. This prevents replay attacks and rogue command injection.
		if !protocol.VerifyCommand(cmd, cloudPubKey) {
			logger.Error().
				Str("idempotency_key", cmd.IdempotencyKey).
				Str("command_type", cmd.CommandType).
				Msg("command signature verification failed — rejecting")

			resp := protocol.CommandResponse{
				DeviceID:       cfg.DeviceID,
				IdempotencyKey: cmd.IdempotencyKey,
				Success:        false,
				Error:          "signature verification failed",
			}
			if respEnv, err := encodeEnvelope(protocol.TypeCommandResponse, env.ID, resp); err == nil {
				_ = client.Send(respEnv)
			}
			return
		}

		logger.Info().
			Str("idempotency_key", cmd.IdempotencyKey).
			Str("command_type", cmd.CommandType).
			Msg("command request received and signature verified")

		resp := executor.ExecuteWithSafeMode(cmd)

		respEnv, err := encodeEnvelope(protocol.TypeCommandResponse, env.ID, resp)
		if err != nil {
			logger.Error().Err(err).Msg("failed to encode command response")
			return
		}
		if err := client.Send(respEnv); err != nil {
			logger.Error().Err(err).Msg("failed to send command response")
		}

	case protocol.TypeHeartbeat:
		logger.Debug().Str("id", env.ID).Msg("received heartbeat from cloud")

	default:
		logger.Warn().Str("type", string(env.Type)).Str("id", env.ID).Msg("unhandled envelope type")
	}
}

// runEnrollment performs the first-time device registration flow:
//  1. Opens a WebSocket to the cloud enrollment endpoint.
//  2. Sends an EnrollRequest with the provided token.
//  3. Receives an EnrollResponse and persists the config.
func runEnrollment(token, cloudURL, configPath string, logger zerolog.Logger) error {
	if cloudURL == "" {
		return fmt.Errorf("--cloud-url is required for enrollment")
	}
	if token == "" {
		return fmt.Errorf("--enroll-token is required for enrollment")
	}

	logger.Info().Str("cloud_url", cloudURL).Msg("starting enrollment")

	// Bootstrap a minimal config for the enrollment connection.
	// The JWT is empty until the cloud issues one.
	enrollCfg := &config.AgentConfig{
		CloudWSURL: cloudURL + "/ws/enroll",
		DeviceID:   "pending",
		OrgID:      "pending",
		JWT:        "", // will be populated by EnrollResponse
		Version:    Version,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Use a plain (unauthenticated) WebSocket connection for enrollment.
	enrollClient := tunnel.NewTunnelClient(enrollCfg, logger)
	if err := enrollClient.Connect(ctx); err != nil {
		return fmt.Errorf("enrollment connect: %w", err)
	}
	defer enrollClient.Close()

	req := protocol.EnrollRequest{
		Token:      token,
		PublicKey:  "", // In production: generate an ephemeral ECDSA key here
		ROSVersion: "unknown",
		BoardName:  "unknown",
	}

	env, err := encodeEnvelope(protocol.TypeEnrollRequest, newID(), req)
	if err != nil {
		return fmt.Errorf("encode enroll request: %w", err)
	}
	if err := enrollClient.Send(env); err != nil {
		return fmt.Errorf("send enroll request: %w", err)
	}

	// Wait for the enroll response.
	select {
	case <-ctx.Done():
		return fmt.Errorf("enrollment timed out")
	case respEnv := <-enrollClient.MsgChan():
		if respEnv.Type != protocol.TypeEnrollResponse {
			return fmt.Errorf("unexpected response type %q during enrollment", respEnv.Type)
		}
		var resp protocol.EnrollResponse
		if err := msgpack.Unmarshal(respEnv.Payload, &resp); err != nil {
			return fmt.Errorf("decode enroll response: %w", err)
		}

		finalCfg := &config.AgentConfig{
			DeviceID:              resp.DeviceID,
			OrgID:                 resp.OrgID,
			JWT:                   resp.JWT,
			CloudPublicKey:        resp.CloudPublicKey,
			CloudWSURL:            cloudURL + "/ws/agent",
			RouterOSHost:          "127.0.0.1",
			RouterOSPort:          8728,
			RouterOSUsername:      "admin",
			RouterOSPasswordEnc:   "",
			MetricIntervalSeconds: 30,
			Version:               Version,
		}

		if err := config.Save(configPath, finalCfg); err != nil {
			return fmt.Errorf("save config: %w", err)
		}

		logger.Info().
			Str("device_id", resp.DeviceID).
			Str("org_id", resp.OrgID).
			Str("config_path", configPath).
			Msg("enrollment successful, config saved")
	}

	return nil
}

// periodicUpdate checks for a new agent binary every 6 hours.
func periodicUpdate(ctx context.Context, upd *updater.Updater, logger zerolog.Logger) {
	// Check soon after startup, then on a regular interval.
	initialDelay := 2 * time.Minute
	checkInterval := 6 * time.Hour

	timer := time.NewTimer(initialDelay)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			if err := upd.CheckAndUpdate(ctx); err != nil {
				logger.Error().Err(err).Msg("update check failed")
			}
			timer.Reset(checkInterval)
		}
	}
}

// encodeEnvelope marshals payload to MessagePack and wraps it in an Envelope.
func encodeEnvelope(msgType protocol.MessageType, id string, payload any) (protocol.Envelope, error) {
	payloadBytes, err := msgpack.Marshal(payload)
	if err != nil {
		return protocol.Envelope{}, fmt.Errorf("marshal payload for %s: %w", msgType, err)
	}
	return protocol.Envelope{
		Type:    msgType,
		ID:      id,
		Payload: payloadBytes,
	}, nil
}

// newID returns a lightweight pseudo-unique identifier. In production this
// would use github.com/google/uuid; we avoid adding a dependency by
// generating a hex string from the current nanosecond timestamp.
// This is collision-resistant enough for request/response correlation.
func newID() string {
	return fmt.Sprintf("%x", time.Now().UnixNano())
}

// buildLogger constructs a zerolog.Logger with the specified level and format.
func buildLogger(level string, jsonOutput bool) zerolog.Logger {
	lvl, err := zerolog.ParseLevel(level)
	if err != nil {
		lvl = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(lvl)

	if jsonOutput {
		return zerolog.New(os.Stdout).With().Timestamp().Logger()
	}

	// Pretty console output for development / TTY environments.
	return zerolog.New(zerolog.ConsoleWriter{
		Out:        os.Stdout,
		TimeFormat: time.RFC3339,
	}).With().Timestamp().Logger()
}

