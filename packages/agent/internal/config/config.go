package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// AgentConfig holds all configuration for the MikroTik agent. It is persisted
// as a JSON file on disk after enrollment and loaded on subsequent starts.
type AgentConfig struct {
	// Identity fields assigned by the cloud during enrollment.
	DeviceID string `json:"device_id"`
	OrgID    string `json:"org_id"`

	// JWT issued by the cloud. Used as Bearer token on the WebSocket handshake.
	JWT string `json:"jwt"`

	// CloudPublicKey is the PEM-encoded ECDSA public key used to verify
	// command signatures received from the cloud.
	CloudPublicKey string `json:"cloud_public_key"`

	// CloudWSURL is the full WSS endpoint, e.g. wss://cloud.example.com/ws/agent.
	CloudWSURL string `json:"cloud_ws_url"`

	// RouterOS connection parameters.
	RouterOSHost            string `json:"routeros_host"`
	RouterOSPort            int    `json:"routeros_port"`
	RouterOSUsername        string `json:"routeros_username"`
	RouterOSPasswordEnc     string `json:"routeros_password_enc"`

	// MetricIntervalSeconds controls how often metrics are pushed to the cloud.
	MetricIntervalSeconds int `json:"metric_interval_seconds"`

	// Version is stamped by the build system via ldflags and stored so the
	// updater can compare against the server-advertised version.
	Version string `json:"version"`
}

// DefaultRouterOSPort is the plain-text RouterOS API port.
const DefaultRouterOSPort = 8728

// DefaultMetricInterval is used when the field is absent or zero.
const DefaultMetricInterval = 30

// Load reads and unmarshals an AgentConfig from the JSON file at path.
// It returns a descriptive error that includes the path so callers can
// surface it cleanly in logs without wrapping again.
func Load(path string) (*AgentConfig, error) {
	f, err := os.Open(path) // #nosec G304 — path is operator-supplied config
	if err != nil {
		return nil, fmt.Errorf("config: open %q: %w", path, err)
	}
	defer f.Close()

	var cfg AgentConfig
	dec := json.NewDecoder(f)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&cfg); err != nil {
		return nil, fmt.Errorf("config: decode %q: %w", path, err)
	}

	cfg.applyDefaults()

	if err := cfg.validate(); err != nil {
		return nil, fmt.Errorf("config: validate %q: %w", path, err)
	}

	return &cfg, nil
}

// Save marshals cfg to JSON and atomically writes it to path. It creates the
// parent directory if it does not already exist.
func Save(path string, cfg *AgentConfig) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("config: mkdir %q: %w", dir, err)
	}

	// Write to a temp file in the same directory, then rename — atomic on
	// POSIX filesystems so a crash mid-write never leaves a partial config.
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return fmt.Errorf("config: create temp %q: %w", tmp, err)
	}

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if encErr := enc.Encode(cfg); encErr != nil {
		f.Close()
		os.Remove(tmp) // best-effort cleanup
		return fmt.Errorf("config: encode: %w", encErr)
	}

	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmp)
		return fmt.Errorf("config: sync %q: %w", tmp, err)
	}
	f.Close()

	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("config: rename %q -> %q: %w", tmp, path, err)
	}

	return nil
}

// applyDefaults fills in zero-value fields with sensible defaults.
func (c *AgentConfig) applyDefaults() {
	if c.RouterOSPort == 0 {
		c.RouterOSPort = DefaultRouterOSPort
	}
	if c.MetricIntervalSeconds == 0 {
		c.MetricIntervalSeconds = DefaultMetricInterval
	}
}

// validate returns an error if any required fields are missing.
func (c *AgentConfig) validate() error {
	switch {
	case c.DeviceID == "":
		return fmt.Errorf("device_id is required")
	case c.OrgID == "":
		return fmt.Errorf("org_id is required")
	case c.JWT == "":
		return fmt.Errorf("jwt is required")
	case c.CloudPublicKey == "":
		return fmt.Errorf("cloud_public_key is required")
	case c.CloudWSURL == "":
		return fmt.Errorf("cloud_ws_url is required")
	case c.RouterOSHost == "":
		return fmt.Errorf("routeros_host is required")
	}
	return nil
}
