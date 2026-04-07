# Roadmap

## Guiding principles

- **Ship working software over complete software.** Phase 1 is usable and valuable on its own.
- **Each phase unlocks the next revenue tier.** Free → Pro → Enterprise maps to the phase milestones.
- **Agent adoption is the bottleneck.** Every phase includes onboarding improvements because agent install friction is the #1 reason for churn.

---

## Phase 1 — MVP (weeks 1–12)

**Goal:** Get the first 10 paying customers. Prove the core loop: enroll a device → see it → manage it.

### Infrastructure

- [ ] Turborepo monorepo scaffold (`web`, `api`, `db`, `types`, `ui`, `agent`)
- [ ] PostgreSQL 17 + TimescaleDB setup on Railway
- [ ] Cloudflare Worker + Durable Objects for agent tunnels
- [ ] CI/CD: GitHub Actions → Vercel (web) + Railway (API)
- [ ] OpenTelemetry traces piped to Axiom

### Authentication & organizations

- [ ] Better Auth: email/password + Google OAuth
- [ ] Organization creation on signup (auto-generate slug)
- [ ] Invite members by email (pending invite flow)
- [ ] Roles: owner, admin, operator, viewer (enforced at tRPC procedure level)
- [ ] Basic org settings page (name, timezone)

### Device management

- [ ] Add device wizard (connection type selection)
- [ ] Agent installation flow: one-time enroll token → copy-paste install command
- [ ] Go agent: WSS tunnel, heartbeat, enrollment, basic metric push
- [ ] Direct REST mode for RouterOS v7 devices with public IPs
- [ ] Device list view: name, status (online/offline), last seen, ROS version
- [ ] Device detail page: system info, uptime, connected interfaces

### Monitoring

- [ ] CPU load graph (live, 1-hour window via uPlot)
- [ ] Memory usage graph
- [ ] Per-interface RX/TX bandwidth graph
- [ ] Status badge: online / offline / warning
- [ ] Offline alert via email when device goes offline for > 5 minutes

### Config management

- [ ] View IP addresses (IP → Address)
- [ ] View DHCP leases
- [ ] View firewall rules (read-only)
- [ ] Manual config backup (trigger export, download .rsc)
- [ ] Config snapshot viewer

### Billing

- [ ] Free plan: 3 devices, 1 user, 7-day retention
- [ ] Pro plan: unlimited devices, 5 users, 30-day retention ($5/device/month)
- [ ] Stripe Checkout integration
- [ ] Stripe Customer Portal (plan changes, invoice history)
- [ ] Plan enforcement middleware (block actions over limit)

### Deliverable

A working product where a network engineer can:
1. Sign up → create org → invite a colleague
2. Install the agent on a MikroTik router in < 5 minutes
3. See the router online with live CPU/RAM/bandwidth graphs
4. View the current IP addresses and firewall rules
5. Download a config backup
6. Get an email if the router goes offline

---

## Phase 2 — Core value (weeks 12–24)

**Goal:** Make the platform indispensable. Users start their day on the dashboard instead of Winbox.

### Config push

- [ ] Push firewall rule (add/remove) with safe mode + auto-rollback
- [ ] Config diff viewer: compare any two snapshots side by side
- [ ] Scheduled backups: nightly or weekly, stored in R2
- [ ] Backup retention management per plan
- [ ] Restore from backup (with dry-run preview)
- [ ] Pending command queue: commands delivered when offline device reconnects

### Alerting

- [ ] Alert rules UI: create threshold-based rules (CPU > 90%, memory < 100MB)
- [ ] Alert channels: email, webhook (POST to any URL), Slack incoming webhook
- [ ] Alert event log with acknowledge + notes
- [ ] Cooldown period to prevent alert spam
- [ ] Device group alerts (apply rule to all devices with a tag)

### Fleet management

- [ ] Sites: group devices by location (branch, data center, customer)
- [ ] Tags: free-form tagging with tag-based filtering
- [ ] Bulk actions: restart selected devices, trigger backups for a site
- [ ] Device search: by name, IP, tag, site, status

### SNMP connectivity mode

- [ ] SNMP v2c/v3 polling support
- [ ] Auto-detect RouterOS v6 → suggest SNMP or binary API
- [ ] RouterOS binary API (TCP 8728) connectivity mode

### Access control

- [ ] API keys (per-org, scoped to read / config:push / admin)
- [ ] Audit log viewer in UI (filter by action, device, user, date)
- [ ] Per-device permissions override (restrict operator to specific devices)

### Deliverable

- Users rely on the dashboard for day-to-day operations
- ISPs with 50+ routers can push firewall updates fleet-wide in one action
- On-call engineers get alerted before customers notice outages

---

## Phase 3 — Monetization (months 6–12)

**Goal:** Unlock the enterprise and reseller tiers. Increase ARPU through add-on modules.

### White-label / reseller

- [ ] Reseller account type (org that can create child orgs)
- [ ] Custom domain support (manage.yourisp.com)
- [ ] Logo + color scheme customization (per reseller org)
- [ ] Reseller billing: charge per child-org device count
- [ ] Child-org isolation (reseller cannot see child-org data, only billing summary)

### Hotspot & user management

- [ ] MikroTik Hotspot user CRUD
- [ ] Hotspot profile management (speed limits, data caps)
- [ ] Voucher code generation (printable PDF batches)
- [ ] Session activity log (user, IP, bytes, duration)
- [ ] PPPoE user management (view, add, suspend)

### Enterprise features

- [ ] SSO / SAML 2.0 integration
- [ ] SCIM user provisioning
- [ ] 1-year metric retention
- [ ] Custom alert rule templates shared across org
- [ ] Priority support SLA with dedicated Slack channel

### Firmware management

- [ ] RouterOS version inventory across fleet
- [ ] Scheduled firmware upgrade (off-peak hours)
- [ ] Staged rollout: upgrade 10% of devices first, then rest
- [ ] Auto-rollback if device goes offline after upgrade

### AI assistant (public beta)

- [ ] Config assistant: natural language → firewall rules
- [ ] Existing rule explainer
- [ ] NL → SQL for fleet queries ("show devices with CPU > 80% yesterday")
- [ ] Anomaly detection: baseline per device, alert on unusual traffic patterns
- [ ] Incident summary: "Device X went offline 3 times this week — here's why"

---

## Phase 4 — Platform (year 2)

**Goal:** Become the operating system for ISP networks. Multi-vendor, ecosystem, mobile.

### Multi-vendor support

- [ ] Ubiquiti UniFi integration (read-only monitoring)
- [ ] TP-Link Omada integration
- [ ] Generic SNMP device support (any vendor)
- [ ] Cisco IOS basic support (SSH + show commands)

### Network intelligence

- [ ] Topology map: auto-discovered via LLDP/CDP, rendered as interactive graph
- [ ] IP address management (IPAM): visual subnet management
- [ ] BGP neighbour status and prefix counts
- [ ] OSPF adjacency monitor
- [ ] Security audit: open management ports, default passwords, outdated firmware

### Platform & ecosystem

- [ ] Public API (REST + Webhook) with OpenAPI documentation
- [ ] Zapier / n8n integration
- [ ] App marketplace: community-built modules
- [ ] Terraform provider for infrastructure-as-code provisioning

### Mobile app

- [ ] iOS + Android app (React Native)
- [ ] Push notifications for critical alerts
- [ ] Quick device status view
- [ ] Remote restart / safe mode toggle
- [ ] Offline mode: cached last-known state

---

## Non-goals (explicitly out of scope)

These are things we have decided *not* to build, at least until Phase 4:

- **Full Winbox replacement** — we are a management layer, not an IDE for RouterOS. Deep packet inspection, traffic flows, bridge port configuration, and other advanced Winbox features are out of scope for the initial versions.
- **On-premise deployment** — cloud-only for now. On-premise is a Phase 3 enterprise add-on.
- **Mobile app** — Phase 4. A well-designed progressive web app handles 90% of mobile use cases in the meantime.
- **Non-MikroTik vendors** — Phase 4 expansion. We go deep on MikroTik first.

---

## Version milestones

| Version | Target | Description |
|---|---|---|
| v0.1 | Week 4 | Agent + tunnel working, device shows online |
| v0.2 | Week 6 | Live metrics graphs on dashboard |
| v0.3 | Week 8 | Auth, orgs, invites, roles |
| v0.4 | Week 10 | Config viewer, manual backup |
| v0.5 | Week 12 | Stripe billing, free + pro plans — **MVP launch** |
| v0.6 | Week 16 | Config push with safe mode |
| v0.7 | Week 18 | Alert rules + email/webhook/Slack |
| v0.8 | Week 20 | Scheduled backups, restore |
| v0.9 | Week 22 | API keys, audit log UI |
| v1.0 | Week 24 | Stable, documented, SNMP mode — **Phase 2 complete** |
