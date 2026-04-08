-- Application tables for MikroTik SaaS
-- Run after Better Auth tables are created

CREATE TYPE connection_type AS ENUM ('agent', 'rest', 'binary_api', 'snmp');
CREATE TYPE device_status AS ENUM ('online', 'offline', 'warning', 'unreachable');

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  location TEXT,
  latitude TEXT,
  longitude TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  connection_type connection_type NOT NULL DEFAULT 'agent',
  ip_address TEXT,
  api_port INTEGER DEFAULT 8728,
  api_username_enc TEXT,
  api_password_enc TEXT,
  snmp_community TEXT,
  snmp_version VARCHAR(5),
  ros_version VARCHAR(20),
  board_name VARCHAR(100),
  model VARCHAR(100),
  mac_address VARCHAR(17),
  status device_status NOT NULL DEFAULT 'offline',
  last_seen_at TIMESTAMP,
  uptime_seconds BIGINT,
  site_id UUID REFERENCES sites(id),
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS devices_org_id_idx ON devices(org_id);
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(status);

CREATE TABLE IF NOT EXISTS agent_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  enroll_token TEXT NOT NULL UNIQUE,
  token_used BOOLEAN NOT NULL DEFAULT false,
  agent_version VARCHAR(20),
  client_cert_fingerprint TEXT,
  last_connected_at TIMESTAMP,
  connected_ip TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_metrics (
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  collected_at TIMESTAMP NOT NULL,
  cpu_load SMALLINT,
  free_memory INTEGER,
  total_memory INTEGER,
  uptime BIGINT,
  interfaces JSONB NOT NULL DEFAULT '[]',
  PRIMARY KEY (device_id, collected_at)
);

CREATE TABLE IF NOT EXISTS config_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  taken_at TIMESTAMP NOT NULL DEFAULT NOW(),
  triggered_by VARCHAR(20),
  triggered_by_user_id TEXT,
  export_rsc TEXT NOT NULL,
  size_bytes INTEGER,
  storage_key TEXT,
  checksum VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  metric VARCHAR(100) NOT NULL,
  operator VARCHAR(5) NOT NULL,
  threshold NUMERIC NOT NULL,
  channels TEXT[] NOT NULL DEFAULT '{}',
  cooldown_minutes INTEGER NOT NULL DEFAULT 15,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  fired_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  metric_value NUMERIC NOT NULL,
  notified BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  actor_user_id TEXT,
  actor_type VARCHAR(50) NOT NULL DEFAULT 'user',
  action VARCHAR(200) NOT NULL,
  target_device_id UUID REFERENCES devices(id),
  target_resource VARCHAR(200),
  payload_before JSONB,
  payload_after JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
