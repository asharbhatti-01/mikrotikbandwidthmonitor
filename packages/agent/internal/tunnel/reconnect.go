package tunnel

import (
	"context"
	"math"
	"math/rand"
	"time"

	"github.com/rs/zerolog"

	"github.com/mikrotik-saas/agent/internal/config"
)

const (
	// baseDelay is the initial retry interval.
	baseDelay = 1 * time.Second

	// maxDelay caps the exponential growth so the agent never waits more than
	// a minute before retrying.
	maxDelay = 60 * time.Second

	// jitterFraction controls the width of the random jitter window relative
	// to the computed delay. A value of 0.3 means ±30% around the base value.
	jitterFraction = 0.3
)

// backoffDuration returns the amount of time to wait before the next
// connection attempt given a zero-indexed attempt counter.
//
// The formula is:  min(baseDelay * 2^attempt, maxDelay)  ±  jitter
//
// Jitter prevents thundering-herd reconnection storms when many agents lose
// connectivity simultaneously (e.g. after a cloud deployment restart).
func backoffDuration(attempt int) time.Duration {
	if attempt < 0 {
		attempt = 0
	}

	// Compute the pure exponential part, clamping the exponent to avoid
	// float64 overflow for very large attempt counts.
	exp := math.Min(float64(attempt), 20) // 2^20 * 1s = ~12 days, well above maxDelay
	base := float64(baseDelay) * math.Pow(2, exp)

	if base > float64(maxDelay) {
		base = float64(maxDelay)
	}

	// Apply symmetric jitter: multiply by a value in [1-j, 1+j].
	jitter := 1 + jitterFraction*(2*rand.Float64()-1) // #nosec G404 — non-crypto use
	delay := time.Duration(base * jitter)

	// Safety clamp: never return a negative or zero duration.
	if delay < time.Millisecond {
		delay = time.Millisecond
	}
	if delay > maxDelay+time.Duration(float64(maxDelay)*jitterFraction) {
		delay = maxDelay + time.Duration(float64(maxDelay)*jitterFraction)
	}

	return delay
}

// ConnectWithRetry attempts to connect the TunnelClient in a loop, backing
// off exponentially between attempts. It returns when either:
//   - the connection is established successfully, or
//   - ctx is cancelled.
//
// The returned TunnelClient is fully connected. Callers should defer
// client.Close() after a successful return.
func ConnectWithRetry(ctx context.Context, cfg *config.AgentConfig, log zerolog.Logger) (*TunnelClient, error) {
	log = log.With().Str("component", "reconnect").Logger()

	client := NewTunnelClient(cfg, log)

	for attempt := 0; ; attempt++ {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		err := client.Connect(ctx)
		if err == nil {
			if attempt > 0 {
				log.Info().Int("attempt", attempt+1).Msg("reconnected successfully")
			}
			return client, nil
		}

		delay := backoffDuration(attempt)
		log.Warn().
			Err(err).
			Int("attempt", attempt+1).
			Dur("backoff", delay).
			Msg("connection failed, will retry")

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(delay):
			// Continue to next attempt.
		}
	}
}

// MaintainConnection wraps a connected TunnelClient and automatically
// reconnects whenever the underlying connection drops. It launches a
// background goroutine that watches the tunnel's done channel and triggers
// a fresh ConnectWithRetry cycle.
//
// onReconnect is called (in the background goroutine) each time a new
// connection is established after the first one. Pass nil if not needed.
func MaintainConnection(
	ctx context.Context,
	cfg *config.AgentConfig,
	log zerolog.Logger,
	onReconnect func(newClient *TunnelClient),
) (*TunnelClient, error) {
	log = log.With().Str("component", "maintain_conn").Logger()

	client, err := ConnectWithRetry(ctx, cfg, log)
	if err != nil {
		return nil, err
	}

	go func() {
		for {
			// Block until the current client signals it is done (connection dropped).
			select {
			case <-ctx.Done():
				return
			case <-client.done:
			}

			log.Warn().Msg("tunnel connection lost, reconnecting")

			newClient, err := ConnectWithRetry(ctx, cfg, log)
			if err != nil {
				// ctx was cancelled.
				return
			}

			// Atomically swap the public reference. Note: callers that
			// cached the previous client pointer will need to re-read it
			// via whatever mechanism the agent uses (e.g. an atomic pointer
			// or a channel delivering the new client). For simplicity here,
			// we invoke the provided callback.
			client = newClient
			if onReconnect != nil {
				onReconnect(newClient)
			}
		}
	}()

	return client, nil
}
