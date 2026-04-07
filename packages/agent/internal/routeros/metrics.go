package routeros

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/rs/zerolog"

	"github.com/mikrotik-saas/agent/internal/protocol"
)

// MetricCollector periodically queries RouterOS for system and interface
// statistics and publishes them to an outbound channel for the tunnel client
// to forward to the cloud.
type MetricCollector struct {
	client   *Client
	interval time.Duration
	deviceID string
	outChan  chan<- protocol.MetricPush
	log      zerolog.Logger
}

// NewMetricCollector constructs a MetricCollector. outChan must be buffered
// by the caller; the collector drops a cycle if the channel is full rather
// than blocking, to avoid stalling the ticker.
func NewMetricCollector(
	client *Client,
	interval time.Duration,
	deviceID string,
	outChan chan<- protocol.MetricPush,
	log zerolog.Logger,
) *MetricCollector {
	return &MetricCollector{
		client:   client,
		interval: interval,
		deviceID: deviceID,
		outChan:  outChan,
		log:      log.With().Str("component", "metric_collector").Logger(),
	}
}

// Start runs the collection loop until ctx is cancelled. It blocks the
// calling goroutine and should therefore be called in its own goroutine.
func (m *MetricCollector) Start(ctx context.Context) {
	m.log.Info().Dur("interval", m.interval).Msg("metric collector started")
	ticker := time.NewTicker(m.interval)
	defer func() {
		ticker.Stop()
		m.log.Info().Msg("metric collector stopped")
	}()

	// Collect immediately on start, before waiting for the first tick.
	m.collect()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.collect()
		}
	}
}

// collect runs a single collection cycle and sends the result on outChan.
func (m *MetricCollector) collect() {
	push, err := m.collectMetrics()
	if err != nil {
		m.log.Error().Err(err).Msg("metric collection failed")
		return
	}

	select {
	case m.outChan <- *push:
		m.log.Debug().
			Int8("cpu", push.CPU).
			Int64("free_mem", push.FreeMem).
			Int("ifaces", len(push.Interfaces)).
			Msg("metric push queued")
	default:
		m.log.Warn().Msg("metric outChan full, dropping sample")
	}
}

// collectMetrics queries RouterOS for system resources and interface stats,
// returning a fully populated MetricPush.
func (m *MetricCollector) collectMetrics() (*protocol.MetricPush, error) {
	res, err := m.collectSystemResource()
	if err != nil {
		return nil, fmt.Errorf("collect system resource: %w", err)
	}

	ifaces, err := m.collectInterfaces()
	if err != nil {
		// Interface stats are best-effort; log but don't fail the whole cycle.
		m.log.Warn().Err(err).Msg("interface stat collection failed; using empty list")
		ifaces = nil
	}

	return &protocol.MetricPush{
		DeviceID:   m.deviceID,
		Timestamp:  time.Now().UTC(),
		CPU:        res.cpu,
		FreeMem:    res.freeMem,
		TotalMem:   res.totalMem,
		Uptime:     res.uptime,
		Interfaces: ifaces,
	}, nil
}

// systemResource holds the parsed fields from /system/resource/print.
type systemResource struct {
	cpu      int8
	freeMem  int64
	totalMem int64
	uptime   int64 // seconds
}

func (m *MetricCollector) collectSystemResource() (systemResource, error) {
	rows, err := m.client.Execute("/system/resource/print", nil)
	if err != nil {
		return systemResource{}, err
	}
	if len(rows) == 0 {
		return systemResource{}, fmt.Errorf("no rows returned from /system/resource/print")
	}

	row := rows[0]
	var res systemResource

	// cpu-load is a percentage integer, e.g. "12".
	if v, ok := row["cpu-load"]; ok {
		n, err := strconv.ParseInt(v, 10, 16)
		if err == nil {
			res.cpu = int8(n)
		}
	}

	if v, ok := row["free-memory"]; ok {
		res.freeMem, _ = strconv.ParseInt(v, 10, 64)
	}
	if v, ok := row["total-memory"]; ok {
		res.totalMem, _ = strconv.ParseInt(v, 10, 64)
	}

	// RouterOS uptime is formatted as "Xd Xh Xm Xs" — convert to seconds.
	if v, ok := row["uptime"]; ok {
		res.uptime = parseUptimeToSeconds(v)
	}

	return res, nil
}

func (m *MetricCollector) collectInterfaces() ([]protocol.IfaceStats, error) {
	rows, err := m.client.Execute("/interface/print", map[string]string{
		"stats": "",
	})
	if err != nil {
		return nil, err
	}

	ifaces := make([]protocol.IfaceStats, 0, len(rows))
	for _, row := range rows {
		iface := protocol.IfaceStats{
			Name: row["name"],
		}
		iface.RxBytes, _ = strconv.ParseInt(row["rx-byte"], 10, 64)
		iface.TxBytes, _ = strconv.ParseInt(row["tx-byte"], 10, 64)
		iface.RxPackets, _ = strconv.ParseInt(row["rx-packet"], 10, 64)
		iface.TxPackets, _ = strconv.ParseInt(row["tx-packet"], 10, 64)
		ifaces = append(ifaces, iface)
	}
	return ifaces, nil
}

// parseUptimeToSeconds converts a RouterOS uptime string like "1d2h3m4s"
// into a total number of seconds. Unrecognised tokens are silently skipped.
func parseUptimeToSeconds(s string) int64 {
	var total int64
	var num int64
	for _, ch := range s {
		switch {
		case ch >= '0' && ch <= '9':
			num = num*10 + int64(ch-'0')
		case ch == 'd':
			total += num * 86400
			num = 0
		case ch == 'h':
			total += num * 3600
			num = 0
		case ch == 'm':
			total += num * 60
			num = 0
		case ch == 's':
			total += num
			num = 0
		}
	}
	return total
}
