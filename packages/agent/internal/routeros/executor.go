package routeros

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/mikrotik-saas/agent/internal/protocol"
)

// pendingRollback holds the state required to execute a safe-mode rollback
// after the TTL expires.
type pendingRollback struct {
	timer           *time.Timer
	idempotencyKey  string
	rollbackPayload json.RawMessage
	commandType     string
}

// Executor executes CommandRequests against the RouterOS API. It supports
// safe mode: when a command arrives with SafeMode=true, a rollback timer is
// started. If the operator confirms the change before the timer fires, the
// rollback is cancelled. If not, the original state is restored automatically.
type Executor struct {
	client *Client
	log    zerolog.Logger

	mu          sync.Mutex
	pendingAcks map[string]*pendingRollback // keyed by idempotency key
}

// NewExecutor creates an Executor backed by the supplied RouterOS client.
func NewExecutor(client *Client, log zerolog.Logger) *Executor {
	return &Executor{
		client:      client,
		log:         log.With().Str("component", "executor").Logger(),
		pendingAcks: make(map[string]*pendingRollback),
	}
}

// ExecuteWithSafeMode executes the supplied command and returns a
// CommandResponse. When cmd.SafeMode is true and cmd.SafeModeTTL is > 0, a
// rollback timer is armed; ConfirmCommand must be called before the TTL
// expires to prevent automatic rollback.
func (e *Executor) ExecuteWithSafeMode(cmd protocol.CommandRequest) protocol.CommandResponse {
	log := e.log.With().
		Str("idempotency_key", cmd.IdempotencyKey).
		Str("command_type", cmd.CommandType).
		Bool("safe_mode", cmd.SafeMode).
		Logger()

	log.Info().Msg("executing command")

	result, err := e.dispatch(cmd.CommandType, cmd.Payload)
	if err != nil {
		log.Error().Err(err).Msg("command execution failed")
		return protocol.CommandResponse{
			DeviceID:       cmd.DeviceID,
			IdempotencyKey: cmd.IdempotencyKey,
			Success:        false,
			Error:          err.Error(),
		}
	}

	log.Info().Msg("command executed successfully")

	// Arm safe-mode rollback if requested.
	if cmd.SafeMode && cmd.SafeModeTTL > 0 && len(cmd.RollbackPayload) > 0 {
		e.armRollback(cmd, log)
	}

	return protocol.CommandResponse{
		DeviceID:       cmd.DeviceID,
		IdempotencyKey: cmd.IdempotencyKey,
		Success:        true,
		Result:         result,
	}
}

// ConfirmCommand cancels the pending rollback timer for the given
// idempotency key. It returns false if there is no pending rollback for that
// key (e.g. it already fired or was never set).
func (e *Executor) ConfirmCommand(idempotencyKey string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	pending, ok := e.pendingAcks[idempotencyKey]
	if !ok {
		e.log.Warn().Str("idempotency_key", idempotencyKey).Msg("no pending rollback found for confirmation")
		return false
	}

	pending.timer.Stop()
	delete(e.pendingAcks, idempotencyKey)

	e.log.Info().Str("idempotency_key", idempotencyKey).Msg("safe-mode rollback cancelled by operator confirmation")
	return true
}

// PendingRollbackCount returns the number of commands currently awaiting
// operator confirmation. Useful for health-check endpoints.
func (e *Executor) PendingRollbackCount() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return len(e.pendingAcks)
}

// armRollback registers a rollback timer for the command. The timer fires on
// the SafeModeTTL and executes the rollback payload.
func (e *Executor) armRollback(cmd protocol.CommandRequest, log zerolog.Logger) {
	ttl := time.Duration(cmd.SafeModeTTL) * time.Second
	log.Info().Dur("ttl", ttl).Msg("arming safe-mode rollback timer")

	timer := time.AfterFunc(ttl, func() {
		e.executeRollback(cmd.IdempotencyKey, cmd.CommandType, cmd.RollbackPayload)
	})

	e.mu.Lock()
	// If a previous timer exists for this key (should not happen in normal
	// operation), stop it before replacing.
	if old, exists := e.pendingAcks[cmd.IdempotencyKey]; exists {
		old.timer.Stop()
		e.log.Warn().Str("idempotency_key", cmd.IdempotencyKey).Msg("replaced existing rollback timer")
	}
	e.pendingAcks[cmd.IdempotencyKey] = &pendingRollback{
		timer:           timer,
		idempotencyKey:  cmd.IdempotencyKey,
		rollbackPayload: cmd.RollbackPayload,
		commandType:     cmd.CommandType,
	}
	e.mu.Unlock()
}

// executeRollback fires when a safe-mode TTL expires. It removes the pending
// entry and dispatches the rollback command.
func (e *Executor) executeRollback(idempotencyKey, commandType string, payload json.RawMessage) {
	e.mu.Lock()
	delete(e.pendingAcks, idempotencyKey)
	e.mu.Unlock()

	e.log.Warn().
		Str("idempotency_key", idempotencyKey).
		Str("command_type", commandType).
		Msg("safe-mode TTL expired, executing rollback")

	_, err := e.dispatch(commandType, payload)
	if err != nil {
		e.log.Error().Err(err).
			Str("idempotency_key", idempotencyKey).
			Msg("rollback execution failed")
		return
	}
	e.log.Info().Str("idempotency_key", idempotencyKey).Msg("rollback executed successfully")
}

// dispatch routes a command type to the appropriate RouterOS API call.
// payload is a JSON object whose shape depends on commandType.
//
// Supported command types:
//   - "script/run"      — run an inline RouterOS script
//   - "ip/address/add"  — add an IP address
//   - "ip/address/remove" — remove an IP address by .id
//   - "interface/set"   — set interface properties
//   - "raw"             — send a raw API sentence (advanced use)
//
// Unknown command types return an error rather than silently doing nothing.
func (e *Executor) dispatch(commandType string, payload json.RawMessage) ([]byte, error) {
	switch commandType {
	case "script/run":
		return e.runScript(payload)
	case "ip/address/add":
		return e.genericAdd("/ip/address/add", payload)
	case "ip/address/remove":
		return e.genericRemove("/ip/address/remove", payload)
	case "interface/set":
		return e.genericSet("/interface/set", payload)
	case "raw":
		return e.rawCommand(payload)
	default:
		return nil, fmt.Errorf("unknown command type: %q", commandType)
	}
}

// runScript executes an inline RouterOS script via /system/script/run or the
// system console. Payload: {"source": "..."}.
func (e *Executor) runScript(payload json.RawMessage) ([]byte, error) {
	var p struct {
		Source string `json:"source"`
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		return nil, fmt.Errorf("script/run: unmarshal payload: %w", err)
	}
	if p.Source == "" {
		return nil, fmt.Errorf("script/run: source is empty")
	}

	rows, err := e.client.Execute("/system/script/run", map[string]string{
		"source": p.Source,
	})
	if err != nil {
		return nil, fmt.Errorf("script/run: %w", err)
	}
	return marshalRows(rows), nil
}

// genericAdd sends an /add command with parameters decoded from payload.
func (e *Executor) genericAdd(path string, payload json.RawMessage) ([]byte, error) {
	params, err := unmarshalParams(payload)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	rows, err := e.client.Execute(path, params)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return marshalRows(rows), nil
}

// genericRemove sends a /remove command, expecting a ".id" field in payload.
func (e *Executor) genericRemove(path string, payload json.RawMessage) ([]byte, error) {
	params, err := unmarshalParams(payload)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if _, ok := params[".id"]; !ok {
		return nil, fmt.Errorf("%s: payload missing required field .id", path)
	}
	rows, err := e.client.Execute(path, params)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return marshalRows(rows), nil
}

// genericSet sends a /set command with parameters decoded from payload.
func (e *Executor) genericSet(path string, payload json.RawMessage) ([]byte, error) {
	params, err := unmarshalParams(payload)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	rows, err := e.client.Execute(path, params)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return marshalRows(rows), nil
}

// rawCommand accepts a payload of the form {"command": "/path/verb", "params": {"k":"v"}}
// and forwards it directly to the RouterOS API. Use with caution.
func (e *Executor) rawCommand(payload json.RawMessage) ([]byte, error) {
	var p struct {
		Command string            `json:"command"`
		Params  map[string]string `json:"params"`
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		return nil, fmt.Errorf("raw: unmarshal payload: %w", err)
	}
	if p.Command == "" {
		return nil, fmt.Errorf("raw: command is empty")
	}
	rows, err := e.client.Execute(p.Command, p.Params)
	if err != nil {
		return nil, fmt.Errorf("raw: %w", err)
	}
	return marshalRows(rows), nil
}

// unmarshalParams decodes a JSON object into a string-string map suitable for
// passing directly to Client.Execute.
func unmarshalParams(payload json.RawMessage) (map[string]string, error) {
	var params map[string]string
	if err := json.Unmarshal(payload, &params); err != nil {
		return nil, fmt.Errorf("unmarshal params: %w", err)
	}
	return params, nil
}

// marshalRows serialises the RouterOS response rows as JSON for inclusion in
// a CommandResponse.Result byte slice.
func marshalRows(rows []map[string]string) []byte {
	if len(rows) == 0 {
		return nil
	}
	var sb strings.Builder
	sb.WriteString("[")
	for i, row := range rows {
		b, _ := json.Marshal(row)
		if i > 0 {
			sb.WriteString(",")
		}
		sb.Write(b)
	}
	sb.WriteString("]")
	return []byte(sb.String())
}
