package protocol

import (
	"encoding/json"
	"time"
)

// MessageType identifies the kind of message carried inside an Envelope.
// All values are lowercase strings to stay compact over the wire.
type MessageType string

const (
	TypeHeartbeat       MessageType = "heartbeat"
	TypeMetricPush      MessageType = "metric_push"
	TypeCommandRequest  MessageType = "command_request"
	TypeCommandResponse MessageType = "command_response"
	TypeEnrollRequest   MessageType = "enroll_request"
	TypeEnrollResponse  MessageType = "enroll_response"
)

// Envelope is the outermost wrapper for every message exchanged between the
// agent and the cloud. The Payload field contains a MessagePack-encoded
// message whose concrete type is determined by Type.
type Envelope struct {
	// Type identifies the concrete message type in Payload.
	Type MessageType `msgpack:"type"`

	// ID is a UUIDv4 string. The sender sets it; the receiver echoes it in
	// any response so request/response pairs can be correlated.
	ID string `msgpack:"id"`

	// Payload is the MessagePack-encoded inner message.
	Payload []byte `msgpack:"payload"`
}

// Heartbeat is a minimal liveness signal sent at the start of each metric
// interval when there is nothing else to push.
type Heartbeat struct {
	DeviceID  string    `msgpack:"device_id"`
	Timestamp time.Time `msgpack:"timestamp"`
}

// MetricPush carries a full telemetry snapshot for a single collection cycle.
type MetricPush struct {
	DeviceID   string       `msgpack:"device_id"`
	Timestamp  time.Time    `msgpack:"timestamp"`
	CPU        int8         `msgpack:"cpu"`         // percentage 0-100
	FreeMem    int64        `msgpack:"free_mem"`    // bytes
	TotalMem   int64        `msgpack:"total_mem"`   // bytes
	Uptime     int64        `msgpack:"uptime"`      // seconds
	Interfaces []IfaceStats `msgpack:"interfaces"`
}

// IfaceStats holds per-interface counters.
type IfaceStats struct {
	Name      string `msgpack:"name"`
	RxBytes   int64  `msgpack:"rx_bytes"`
	TxBytes   int64  `msgpack:"tx_bytes"`
	RxPackets int64  `msgpack:"rx_packets"`
	TxPackets int64  `msgpack:"tx_packets"`
}

// CommandRequest is sent from the cloud to the agent to execute a change on
// the router. Payload and RollbackPayload are kept as json.RawMessage so the
// executor can forward them verbatim to RouterOS without an intermediate
// unmarshal/re-marshal cycle.
type CommandRequest struct {
	DeviceID        string          `msgpack:"device_id"`
	IdempotencyKey  string          `msgpack:"idempotency_key"`
	CommandType     string          `msgpack:"command_type"`
	Payload         json.RawMessage `msgpack:"payload"`
	Signature       []byte          `msgpack:"signature"`        // ECDSA-SHA256 over IdempotencyKey+CommandType+Payload
	RollbackPayload json.RawMessage `msgpack:"rollback_payload"` // executed automatically on safe-mode timeout
	SafeMode        bool            `msgpack:"safe_mode"`
	SafeModeTTL     int             `msgpack:"safe_mode_ttl"` // seconds; 0 means no safe mode
}

// CommandResponse is the agent's reply to a CommandRequest.
type CommandResponse struct {
	DeviceID       string `msgpack:"device_id"`
	IdempotencyKey string `msgpack:"idempotency_key"`
	Success        bool   `msgpack:"success"`
	Result         []byte `msgpack:"result"` // RouterOS output, if any
	Error          string `msgpack:"error"`  // non-empty when Success is false
}

// EnrollRequest is the first message sent by a fresh agent that has not yet
// been registered. Token is the one-time enrollment token obtained from the
// SaaS dashboard; PublicKey is the agent's own PEM-encoded ECDSA public key
// (generated locally and never transmitted again after enrollment).
type EnrollRequest struct {
	Token      string `msgpack:"token"`
	PublicKey  string `msgpack:"public_key"`  // PEM-encoded agent ECDSA public key
	ROSVersion string `msgpack:"ros_version"` // RouterOS version string
	BoardName  string `msgpack:"board_name"`
}

// EnrollResponse is the cloud's reply to a successful EnrollRequest. The
// agent must persist all fields into its config file before the enrollment
// connection is closed.
type EnrollResponse struct {
	JWT            string `msgpack:"jwt"`              // agent's long-lived JWT
	CloudPublicKey string `msgpack:"cloud_public_key"` // PEM-encoded cloud ECDSA public key
	DeviceID       string `msgpack:"device_id"`
	OrgID          string `msgpack:"org_id"`
}
