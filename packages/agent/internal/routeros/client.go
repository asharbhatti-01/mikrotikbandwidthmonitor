package routeros

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

const (
	// dialTimeout is the TCP connection timeout.
	dialTimeout = 10 * time.Second

	// readTimeout is applied to every read from the API socket.
	readTimeout = 30 * time.Second

	// writeTimeout is applied to every write.
	writeTimeout = 10 * time.Second
)

// Client is a minimal implementation of the RouterOS API protocol (plain TCP,
// port 8728). It is intentionally simple: no connection pooling, no TLS,
// no auto-reconnect — those concerns belong to the caller.
//
// Wire format summary (RouterOS API uses "words"):
//   - Each word is preceded by its byte-length, encoded as a variable-length
//     integer (1–4 bytes, big-endian, with a length prefix byte).
//   - A sentence is a sequence of words terminated by an empty word (length 0).
//   - The first word of a command sentence is the command path (e.g. "/ip/address/print").
//   - Subsequent words are attributes: "=key=value" or "?key=value" for queries.
//   - The reply sentence starts with "!done", "!re", "!trap", or "!fatal".
type Client struct {
	address  string // host:port
	username string
	password string
	log      zerolog.Logger

	conn   net.Conn
	reader *bufio.Reader
}

// NewClient constructs a Client. Connect() must be called before any other
// method.
func NewClient(address, username, password string, log zerolog.Logger) *Client {
	return &Client{
		address:  address,
		username: username,
		password: password,
		log:      log.With().Str("component", "routeros_client").Str("address", address).Logger(),
	}
}

// Connect opens the TCP connection to the RouterOS API port and authenticates
// using Login(). Returns an error if either step fails.
func (c *Client) Connect() error {
	c.log.Debug().Msg("dialling RouterOS API")
	conn, err := net.DialTimeout("tcp", c.address, dialTimeout)
	if err != nil {
		return fmt.Errorf("routeros: dial %s: %w", c.address, err)
	}
	c.conn = conn
	c.reader = bufio.NewReaderSize(conn, 64*1024)

	c.log.Debug().Msg("TCP connection established, logging in")
	if err := c.Login(); err != nil {
		c.conn.Close()
		c.conn = nil
		return fmt.Errorf("routeros: login: %w", err)
	}
	c.log.Info().Str("user", c.username).Msg("authenticated to RouterOS API")
	return nil
}

// Login authenticates the client using the plain-text RouterOS API login
// sequence (RouterOS v6.43+ uses a simplified login: send /login with name
// and password as a single sentence).
func (c *Client) Login() error {
	err := c.sendSentence([]string{
		"/login",
		"=name=" + c.username,
		"=password=" + c.password,
	})
	if err != nil {
		return fmt.Errorf("send login sentence: %w", err)
	}

	reply, err := c.readSentence()
	if err != nil {
		return fmt.Errorf("read login reply: %w", err)
	}

	if len(reply) == 0 {
		return fmt.Errorf("empty login reply")
	}
	if reply[0] != "!done" {
		return fmt.Errorf("login rejected: %s", strings.Join(reply, " "))
	}
	return nil
}

// Execute sends a RouterOS API command and returns the list of reply
// sentences. params is a map of "key" -> "value" pairs that are encoded as
// "=key=value" attribute words.
//
// Returns all "=key=value" pairs from all "!re" sentences, flattened into a
// single map slice for easy iteration by the caller.
func (c *Client) Execute(command string, params map[string]string) ([]map[string]string, error) {
	if c.conn == nil {
		return nil, fmt.Errorf("routeros: not connected")
	}

	words := make([]string, 0, len(params)+1)
	words = append(words, command)
	for k, v := range params {
		words = append(words, "="+k+"="+v)
	}

	if err := c.sendSentence(words); err != nil {
		return nil, fmt.Errorf("routeros: execute %q: send: %w", command, err)
	}

	var results []map[string]string

	for {
		sentence, err := c.readSentence()
		if err != nil {
			return nil, fmt.Errorf("routeros: execute %q: read reply: %w", command, err)
		}
		if len(sentence) == 0 {
			continue
		}

		switch sentence[0] {
		case "!done":
			return results, nil

		case "!re":
			row := make(map[string]string, len(sentence)-1)
			for _, word := range sentence[1:] {
				if !strings.HasPrefix(word, "=") {
					continue
				}
				// Format: =key=value (value may contain '=')
				rest := word[1:] // strip leading '='
				idx := strings.IndexByte(rest, '=')
				if idx < 0 {
					row[rest] = ""
				} else {
					row[rest[:idx]] = rest[idx+1:]
				}
			}
			results = append(results, row)

		case "!trap":
			msg := extractAttribute(sentence, "message")
			return nil, fmt.Errorf("routeros: trap: %s", msg)

		case "!fatal":
			msg := extractAttribute(sentence, "message")
			return nil, fmt.Errorf("routeros: fatal: %s", msg)

		default:
			c.log.Warn().Str("word", sentence[0]).Msg("unknown reply type, ignoring")
		}
	}
}

// Close cleanly shuts down the TCP connection.
func (c *Client) Close() {
	if c.conn != nil {
		c.log.Debug().Msg("closing RouterOS API connection")
		_ = c.conn.Close()
		c.conn = nil
	}
}

// IsConnected reports whether the TCP connection is currently open.
func (c *Client) IsConnected() bool { return c.conn != nil }

// sendSentence writes a sequence of API words followed by the end-of-sentence
// empty word (encoded as a zero length byte).
func (c *Client) sendSentence(words []string) error {
	_ = c.conn.SetWriteDeadline(time.Now().Add(writeTimeout))

	var buf bytes.Buffer
	for _, w := range words {
		if err := writeWord(&buf, w); err != nil {
			return err
		}
	}
	// Terminate with an empty word.
	buf.WriteByte(0)

	_, err := c.conn.Write(buf.Bytes())
	return err
}

// readSentence reads words from the API stream until it encounters an empty
// word (end of sentence) and returns the collected words.
func (c *Client) readSentence() ([]string, error) {
	_ = c.conn.SetReadDeadline(time.Now().Add(readTimeout))

	var sentence []string
	for {
		word, err := readWord(c.reader)
		if err != nil {
			return nil, err
		}
		if word == "" {
			// Empty word signals end of sentence.
			return sentence, nil
		}
		sentence = append(sentence, word)
	}
}

// writeWord encodes a single RouterOS API word into buf using the
// variable-length length prefix encoding.
func writeWord(w io.Writer, word string) error {
	n := len(word)
	var lengthBytes []byte

	switch {
	case n < 0x80:
		lengthBytes = []byte{byte(n)}
	case n < 0x4000:
		b := uint16(n) | 0x8000
		lengthBytes = make([]byte, 2)
		binary.BigEndian.PutUint16(lengthBytes, b)
	case n < 0x200000:
		b := uint32(n) | 0xC00000
		lengthBytes = make([]byte, 3)
		lengthBytes[0] = byte(b >> 16)
		lengthBytes[1] = byte(b >> 8)
		lengthBytes[2] = byte(b)
	case n < 0x10000000:
		b := uint32(n) | 0xE0000000
		lengthBytes = make([]byte, 4)
		binary.BigEndian.PutUint32(lengthBytes, b)
	default:
		return fmt.Errorf("routeros: word too long (%d bytes)", n)
	}

	if _, err := w.Write(lengthBytes); err != nil {
		return err
	}
	if _, err := io.WriteString(w, word); err != nil {
		return err
	}
	return nil
}

// readWord reads a single RouterOS API word from r, including its
// variable-length prefix, and returns the decoded string.
func readWord(r *bufio.Reader) (string, error) {
	firstByte, err := r.ReadByte()
	if err != nil {
		return "", fmt.Errorf("routeros: read length byte: %w", err)
	}

	var length int

	switch {
	case firstByte&0x80 == 0:
		// 1-byte length: 0xxxxxxx
		length = int(firstByte)
	case firstByte&0xC0 == 0x80:
		// 2-byte length: 10xxxxxx xxxxxxxx
		second, err := r.ReadByte()
		if err != nil {
			return "", fmt.Errorf("routeros: read 2-byte length: %w", err)
		}
		length = (int(firstByte&0x3F) << 8) | int(second)
	case firstByte&0xE0 == 0xC0:
		// 3-byte length: 110xxxxx xxxxxxxx xxxxxxxx
		buf := make([]byte, 2)
		if _, err := io.ReadFull(r, buf); err != nil {
			return "", fmt.Errorf("routeros: read 3-byte length: %w", err)
		}
		length = (int(firstByte&0x1F) << 16) | (int(buf[0]) << 8) | int(buf[1])
	case firstByte&0xF0 == 0xE0:
		// 4-byte length: 1110xxxx xxxxxxxx xxxxxxxx xxxxxxxx
		buf := make([]byte, 3)
		if _, err := io.ReadFull(r, buf); err != nil {
			return "", fmt.Errorf("routeros: read 4-byte length: %w", err)
		}
		length = (int(firstByte&0x0F) << 24) | (int(buf[0]) << 16) | (int(buf[1]) << 8) | int(buf[2])
	default:
		return "", fmt.Errorf("routeros: unsupported length prefix byte 0x%02x", firstByte)
	}

	if length == 0 {
		return "", nil // end-of-sentence marker
	}

	wordBuf := make([]byte, length)
	if _, err := io.ReadFull(r, wordBuf); err != nil {
		return "", fmt.Errorf("routeros: read word body (%d bytes): %w", length, err)
	}
	return string(wordBuf), nil
}

// extractAttribute searches a RouterOS reply sentence for a word matching
// "=key=..." and returns the value portion. Returns an empty string if not found.
func extractAttribute(sentence []string, key string) string {
	prefix := "=" + key + "="
	for _, w := range sentence {
		if strings.HasPrefix(w, prefix) {
			return w[len(prefix):]
		}
	}
	return ""
}
