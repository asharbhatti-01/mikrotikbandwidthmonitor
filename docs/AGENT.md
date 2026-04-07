# Agent

The agent is a lightweight Go binary that runs on the customer's network and bridges the cloud platform to RouterOS devices. It is the most critical piece of infrastructure in the system — without it, devices behind NAT cannot be managed.

---

## Why Go?

- **Single static binary** — no runtime, no dependencies, ~5MB on disk
- **Cross-compilation** — one codebase compiles to `linux/amd64`, `linux/arm64`, `linux/mipsle` (RouterOS CHR), and `linux/arm` (Raspberry Pi gateway)
- **Low footprint** — 8–12MB RAM at rest, negligible CPU when idle
- **Native WebSocket** — gorilla/websocket handles the persistent tunnel with minimal overhead

---

## Architecture

```
┌────────────────────────────────────────────────┐
│                  Go Agent                      │
│                                                │
│  ┌──────────────┐     ┌──────────────────────┐ │
│  │  RouterOS    │     │   Cloud Tunnel        │ │
│  │  API Client  │◄───►│  (WSS + MessagePack)  │ │
│  │  (TCP 8728)  │     │                       │ │
│  └──────────────┘     └──────────────────────┘ │
│                                                │
│  ┌──────────────┐     ┌──────────────────────┐ │
│  │  Metric      │     │   Command             │ │
│  │  Collector   │     │   Executor            │ │
│  │  (10s tick)  │     │   (safe mode)         │ │
│  └──────────────┘     └──────────────────────┘ │
│                                                │
│  ┌──────────────┐                              │
│  │  Self-updater│                              │
│  │  (signed bin)│                              │
│  └──────────────┘                              │
└────────────────────────────────────────────────┘
```

---

## Repository structure

```
packages/agent/
├── cmd/
│   └── agent/
│       └── main.go           # Entry point, CLI flags
├── internal/
│   ├── tunnel/
│   │   ├── client.go         # WebSocket tunnel to cloud
│   │   └── reconnect.go      # Jittered exponential backoff
│   ├── routeros/
│   │   ├── client.go         # RouterOS API TCP client
│   │   ├── metrics.go        # Metric collection
│   │   └── executor.go       # Command execution + safe mode
│   ├── protocol/
│   │   ├── messages.go       # MessagePack message types
│   │   └── signer.go         # ECDSA command signature verification
│   ├── config/
│   │   └── config.go         # Agent config file (JSON)
│   └── updater/
│       └── updater.go        # Self-update from R2
├── Makefile
├── go.mod
└── go.sum
```

---

## Protocol

All messages between agent and cloud are **MessagePack-encoded** over WSS. MessagePack is chosen over JSON for ~35% smaller payloads — important for high-frequency metric streams over mobile links.

### Message types

```go
// protocol/messages.go

type MessageType string

const (
  TypeHeartbeat       MessageType = "heartbeat"
  TypeMetricPush      MessageType = "metric_push"
  TypeCommandRequest  MessageType = "command_request"
  TypeCommandResponse MessageType = "command_response"
  TypeEnrollRequest   MessageType = "enroll_request"
  TypeEnrollResponse  MessageType = "enroll_response"
)

type Envelope struct {
  Type    MessageType `msgpack:"type"`
  ID      string      `msgpack:"id"`       // UUID, for correlation
  Payload []byte      `msgpack:"payload"`  // inner MessagePack
}

type MetricPush struct {
  DeviceID  string    `msgpack:"device_id"`
  Timestamp time.Time `msgpack:"ts"`
  CPU       int8      `msgpack:"cpu"`
  FreeMem   int64     `msgpack:"free_mem"`
  TotalMem  int64     `msgpack:"total_mem"`
  Uptime    int64     `msgpack:"uptime"`
  Interfaces []IfaceStats `msgpack:"ifaces"`
}

type IfaceStats struct {
  Name      string `msgpack:"name"`
  RxBytes   int64  `msgpack:"rx"`
  TxBytes   int64  `msgpack:"tx"`
  RxPackets int64  `msgpack:"rxp"`
  TxPackets int64  `msgpack:"txp"`
}

type CommandRequest struct {
  DeviceID        string          `msgpack:"device_id"`
  IdempotencyKey  string          `msgpack:"ikey"`
  CommandType     string          `msgpack:"cmd_type"`
  Payload         json.RawMessage `msgpack:"payload"`
  Signature       []byte          `msgpack:"sig"`     // ECDSA over (ikey + cmd_type + payload)
  RollbackPayload json.RawMessage `msgpack:"rollback"`
  SafeMode        bool            `msgpack:"safe_mode"`
  SafeModeTTL     int             `msgpack:"safe_mode_ttl"` // seconds
}

type CommandResponse struct {
  DeviceID       string `msgpack:"device_id"`
  IdempotencyKey string `msgpack:"ikey"`
  Success        bool   `msgpack:"ok"`
  Result         []byte `msgpack:"result"`
  Error          string `msgpack:"error"`
}
```

### Heartbeat

Agent sends a heartbeat every **10 seconds**. Cloud marks device offline if **3 consecutive heartbeats** are missed (30-second timeout).

```go
// Heartbeat loop
ticker := time.NewTicker(10 * time.Second)
for range ticker.C {
  agent.tunnel.Send(Envelope{
    Type:    TypeHeartbeat,
    Payload: mustMarshal(map[string]any{"version": agent.version, "ros": agent.rosVersion}),
  })
}
```

---

## Safe mode for config push

This is the most important safety feature. It mirrors RouterOS's own safe mode behavior: apply the change, wait for confirmation, auto-rollback if none arrives.

```go
// internal/routeros/executor.go

func (e *Executor) ExecuteWithSafeMode(cmd CommandRequest) CommandResponse {
  // 1. Apply the change
  result, err := e.client.Execute(cmd.Payload)
  if err != nil {
    return CommandResponse{Success: false, Error: err.Error()}
  }

  // 2. Start a rollback timer
  if cmd.SafeMode && cmd.RollbackPayload != nil {
    timer := time.AfterFunc(time.Duration(cmd.SafeModeTTL)*time.Second, func() {
      // Timer fired = no confirmation received = rollback
      log.Warn("safe mode timeout — rolling back", "ikey", cmd.IdempotencyKey)
      e.client.Execute(cmd.RollbackPayload)
    })

    // 3. Send ACK to cloud; cloud will send a confirmation within TTL
    e.ackChan <- AckPayload{IdempotencyKey: cmd.IdempotencyKey, Timer: timer}
  }

  return CommandResponse{Success: true, Result: result}
}

func (e *Executor) ConfirmCommand(ikey string) {
  // Cloud confirmed — stop the rollback timer
  if ack, ok := e.pendingAcks[ikey]; ok {
    ack.Timer.Stop()
    delete(e.pendingAcks, ikey)
  }
}
```

---

## Security

### Enrollment flow

```
1. User clicks "Add device" in dashboard
   → Platform generates a one-time enroll_token (UUID, 24h expiry)
   → Displayed as: curl https://agent.yoursaas.com/install | sh -s -- --token <enroll_token>

2. Agent runs the install script
   → Downloads the agent binary for the detected architecture
   → Generates a local ECDSA keypair (P-256)
   → Calls cloud /enroll with: { token, public_key, ros_version, board_name }

3. Cloud validates token
   → Marks token as used
   → Issues a signed JWT (device identity, org_id, device_id)
   → Returns: { jwt, cloud_public_key }

4. Agent stores JWT + cloud public key in /etc/mikrotik-agent/config.json
   → All subsequent WS connections present the JWT as Bearer token
   → All commands verified against cloud_public_key before execution
```

### Command signature verification

Every command from the cloud is signed with the cloud's ECDSA private key. The agent verifies before executing. This means even if an attacker intercepts the WebSocket connection, they cannot inject commands.

```go
// internal/protocol/signer.go

func VerifyCommand(cmd CommandRequest, cloudPubKey *ecdsa.PublicKey) bool {
  message := cmd.IdempotencyKey + cmd.CommandType + string(cmd.Payload)
  hash := sha256.Sum256([]byte(message))
  return ecdsa.VerifyASN1(cloudPubKey, hash[:], cmd.Signature)
}
```

---

## Reconnection strategy

The agent uses jittered exponential backoff with a cap at 60 seconds. Jitter prevents thundering-herd reconnects after a cloud deployment.

```go
// internal/tunnel/reconnect.go

func backoffDuration(attempt int) time.Duration {
  base := math.Pow(2, float64(attempt)) * float64(time.Second)
  cap  := float64(60 * time.Second)
  jitter := rand.Float64() * float64(time.Second)
  return time.Duration(math.Min(base, cap) + jitter)
}

// Attempt 1:  2s  ± jitter
// Attempt 2:  4s  ± jitter
// Attempt 3:  8s  ± jitter
// Attempt 4: 16s  ± jitter
// Attempt 5: 32s  ± jitter
// Attempt 6+: 60s ± jitter
```

---

## Self-update

The agent checks for updates on startup and every 24 hours.

```go
// internal/updater/updater.go

func (u *Updater) CheckAndUpdate() error {
  resp, err := http.Get("https://agent.yoursaas.com/version")
  latest := resp.Body // { version: "1.2.3", url: "...", sha256: "..." }

  if latest.Version == u.currentVersion {
    return nil // already up to date
  }

  // Download to temp file
  tmp, _ := os.CreateTemp("", "agent-update-*")
  downloadWithVerify(latest.URL, latest.SHA256, tmp)

  // Replace binary atomically
  os.Rename(tmp.Name(), os.Executable())
  // Restart via exec.Command(os.Executable(), os.Args[1:]...)
}
```

Update binaries are signed and hosted on Cloudflare R2. SHA-256 checksum is verified before the binary is executed.

---

## Installation methods

### One-liner (any Linux)

```bash
curl -sSL https://agent.yoursaas.com/install | sh -s -- --token YOUR_ENROLL_TOKEN
```

### RouterOS script (runs directly on the router)

```routeros
# Run in RouterOS terminal or /system scheduler
/tool fetch url="https://agent.yoursaas.com/install-routeros.rsc" dst-path=agent-install.rsc
/import file-name=agent-install.rsc token=YOUR_ENROLL_TOKEN
```

### Docker (for Linux gateway boxes)

```bash
docker run -d \
  --name mikrotik-agent \
  --restart unless-stopped \
  -e ENROLL_TOKEN=YOUR_ENROLL_TOKEN \
  -e ROUTEROS_HOST=192.168.1.1 \
  ghcr.io/your-org/mikrotik-agent:latest
```

### Ansible role (bulk deployment)

```yaml
# playbook.yml
- hosts: network_gateways
  roles:
    - role: mikrotik_agent
      vars:
        enroll_token: "{{ vault_enroll_token }}"
        routeros_host: "{{ routeros_ip }}"
```

---

## Build targets

```makefile
# Makefile
BINARY_NAME = agent
VERSION     = $(shell git describe --tags --always)

build-all:
	GOOS=linux GOARCH=amd64   go build -ldflags="-X main.Version=$(VERSION)" -o bin/agent-linux-amd64   ./cmd/agent
	GOOS=linux GOARCH=arm64   go build -ldflags="-X main.Version=$(VERSION)" -o bin/agent-linux-arm64   ./cmd/agent
	GOOS=linux GOARCH=mipsle  go build -ldflags="-X main.Version=$(VERSION) -s -w" -o bin/agent-linux-mipsle ./cmd/agent
	GOOS=linux GOARCH=arm GOARM=7 go build -ldflags="-X main.Version=$(VERSION)" -o bin/agent-linux-armv7 ./cmd/agent

sign:
	for f in bin/agent-*; do sha256sum $$f > $$f.sha256; done

upload:
	for f in bin/agent-*; do wrangler r2 object put agent-releases/$(VERSION)/$$f --file=$$f; done
```

---

## Configuration file

Stored at `/etc/mikrotik-agent/config.json` after enrollment.

```json
{
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "org_id": "...",
  "jwt": "eyJ...",
  "cloud_public_key": "-----BEGIN PUBLIC KEY-----\n...",
  "cloud_ws_url": "wss://agent.yoursaas.com/connect",
  "routeros_host": "127.0.0.1",
  "routeros_port": 8728,
  "routeros_username": "admin",
  "routeros_password_enc": "<AES-256-GCM encrypted>",
  "metric_interval_seconds": 10,
  "version": "1.2.3"
}
```

The RouterOS password is encrypted with a key derived from the agent's private key — it is never sent to the cloud.
