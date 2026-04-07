package tunnel

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/mikrotik-saas/agent/internal/config"
	"github.com/mikrotik-saas/agent/internal/protocol"
)

const (
	// writeTimeout is applied to every individual WebSocket write operation.
	writeTimeout = 10 * time.Second

	// pingInterval keeps the connection alive through NAT devices and cloud
	// load-balancer idle-connection timeouts.
	pingInterval = 25 * time.Second

	// pongWait is the maximum time we wait for a pong response before
	// treating the connection as dead.
	pongWait = 35 * time.Second

	// outboundBuffer is the number of envelopes that can be queued for send
	// before the caller blocks.
	outboundBuffer = 64
)

// TunnelClient manages a single persistent WebSocket connection to the cloud.
// It owns the goroutines that read from and write to the connection and
// exposes channels for the rest of the agent to consume.
type TunnelClient struct {
	cfg *config.AgentConfig
	log zerolog.Logger

	mu     sync.Mutex
	wsConn *websocket.Conn

	// msgChan delivers decoded inbound envelopes to the agent dispatcher.
	msgChan chan protocol.Envelope

	// cmdChan delivers validated CommandRequests to the executor.
	cmdChan chan protocol.CommandRequest

	// outChan is the write queue; callers use Send() to enqueue.
	outChan chan protocol.Envelope

	closeOnce sync.Once
	done      chan struct{}
}

// NewTunnelClient creates a TunnelClient that is ready to connect but has
// not yet dialled. Call Connect() to establish the WebSocket session.
func NewTunnelClient(cfg *config.AgentConfig, log zerolog.Logger) *TunnelClient {
	return &TunnelClient{
		cfg:     cfg,
		log:     log.With().Str("component", "tunnel").Logger(),
		msgChan: make(chan protocol.Envelope, 128),
		cmdChan: make(chan protocol.CommandRequest, 32),
		outChan: make(chan protocol.Envelope, outboundBuffer),
		done:    make(chan struct{}),
	}
}

// MsgChan returns the read-only channel of inbound protocol envelopes.
// The caller must drain this channel continuously or the read loop will stall.
func (c *TunnelClient) MsgChan() <-chan protocol.Envelope { return c.msgChan }

// CmdChan returns the read-only channel of pre-validated CommandRequests.
func (c *TunnelClient) CmdChan() <-chan protocol.CommandRequest { return c.cmdChan }

// Connect dials the cloud WebSocket endpoint, attaches the JWT as a Bearer
// token in the Upgrade request, and starts the read/write goroutines.
// Connect is idempotent for already-connected clients — it will close any
// existing connection first.
func (c *TunnelClient) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.wsConn != nil {
		_ = c.wsConn.Close()
		c.wsConn = nil
	}

	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+c.cfg.JWT)
	headers.Set("X-Device-ID", c.cfg.DeviceID)
	headers.Set("X-Agent-Version", c.cfg.Version)

	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
	}

	c.log.Info().Str("url", c.cfg.CloudWSURL).Msg("dialling cloud WebSocket")

	conn, resp, err := dialer.DialContext(ctx, c.cfg.CloudWSURL, headers)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("tunnel: dial %s: HTTP %d: %w", c.cfg.CloudWSURL, resp.StatusCode, err)
		}
		return fmt.Errorf("tunnel: dial %s: %w", c.cfg.CloudWSURL, err)
	}

	conn.SetReadLimit(4 << 20) // 4 MiB — protect against malformed large frames
	_ = conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(_ string) error {
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	c.wsConn = conn
	c.log.Info().Msg("WebSocket connection established")

	go c.readLoop(conn)
	go c.writeLoop(conn)

	return nil
}

// Send enqueues an envelope for delivery to the cloud. It returns an error
// if the outbound buffer is full (which indicates back-pressure) rather than
// blocking indefinitely.
func (c *TunnelClient) Send(env protocol.Envelope) error {
	select {
	case c.outChan <- env:
		return nil
	default:
		return fmt.Errorf("tunnel: outbound buffer full, dropping message type=%s id=%s", env.Type, env.ID)
	}
}

// Close shuts down the tunnel client gracefully. It is safe to call multiple
// times; subsequent calls are no-ops.
func (c *TunnelClient) Close() {
	c.closeOnce.Do(func() {
		close(c.done)
		c.mu.Lock()
		if c.wsConn != nil {
			// Send a close frame before closing the underlying TCP connection.
			msg := websocket.FormatCloseMessage(websocket.CloseNormalClosure, "agent shutting down")
			deadline := time.Now().Add(writeTimeout)
			_ = c.wsConn.WriteControl(websocket.CloseMessage, msg, deadline)
			_ = c.wsConn.Close()
		}
		c.mu.Unlock()
		c.log.Info().Msg("tunnel client closed")
	})
}

// readLoop runs in its own goroutine. It continuously reads binary frames from
// the WebSocket, decodes them as MessagePack Envelopes, and dispatches them to
// the appropriate channel.
func (c *TunnelClient) readLoop(conn *websocket.Conn) {
	defer func() {
		c.log.Debug().Msg("read loop exiting")
	}()

	for {
		select {
		case <-c.done:
			return
		default:
		}

		msgType, data, err := conn.ReadMessage()
		if err != nil {
			select {
			case <-c.done:
				return // expected close
			default:
			}
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				c.log.Error().Err(err).Msg("unexpected WebSocket close in read loop")
			}
			return
		}

		if msgType != websocket.BinaryMessage {
			c.log.Warn().Int("msg_type", msgType).Msg("received non-binary WebSocket frame, ignoring")
			continue
		}

		var env protocol.Envelope
		if err := msgpack.Unmarshal(data, &env); err != nil {
			c.log.Error().Err(err).Msg("failed to unmarshal envelope")
			continue
		}

		c.log.Debug().
			Str("type", string(env.Type)).
			Str("id", env.ID).
			Int("payload_bytes", len(env.Payload)).
			Msg("received envelope")

		select {
		case c.msgChan <- env:
		case <-c.done:
			return
		default:
			c.log.Warn().
				Str("type", string(env.Type)).
				Msg("inbound message channel full, dropping envelope")
		}
	}
}

// writeLoop runs in its own goroutine. It drains the outbound queue, sends
// each envelope as a binary WebSocket frame, and keeps the connection alive
// with periodic pings.
func (c *TunnelClient) writeLoop(conn *websocket.Conn) {
	ticker := time.NewTicker(pingInterval)
	defer func() {
		ticker.Stop()
		c.log.Debug().Msg("write loop exiting")
	}()

	for {
		select {
		case <-c.done:
			return

		case env := <-c.outChan:
			data, err := msgpack.Marshal(env)
			if err != nil {
				c.log.Error().Err(err).Str("type", string(env.Type)).Msg("failed to marshal envelope")
				continue
			}
			if err := conn.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
				c.log.Error().Err(err).Msg("failed to set write deadline")
				return
			}
			if err := conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
				c.log.Error().Err(err).Msg("WebSocket write failed")
				return
			}
			c.log.Debug().
				Str("type", string(env.Type)).
				Str("id", env.ID).
				Int("bytes", len(data)).
				Msg("sent envelope")

		case <-ticker.C:
			if err := conn.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
				c.log.Error().Err(err).Msg("failed to set write deadline for ping")
				return
			}
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				c.log.Error().Err(err).Msg("ping failed")
				return
			}
			c.log.Trace().Msg("sent ping")
		}
	}
}
