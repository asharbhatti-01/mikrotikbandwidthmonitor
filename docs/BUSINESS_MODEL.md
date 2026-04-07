# Business Model

## Target customers

| Segment | Description | Typical size | Pain point |
|---|---|---|---|
| ISPs | Internet service providers managing customer CPE routers | 50–5,000 devices | No central view, manual Winbox per router |
| MSPs | Managed service providers handling multiple client networks | 10–500 devices | Each client network is a separate island |
| Enterprise IT | Companies with many branch offices and a central IT team | 5–200 devices | No audit trail, no automated backups |
| Resellers | Companies that want to white-label and resell to their own customers | Any size | Want a product, not infrastructure |

---

## Pricing model

### Per-device SaaS (primary)

The core model is per-enrolled-device per-month. This aligns our revenue with customer value — the more routers they manage, the more they pay, the more valuable we are to them.

| Plan | Price | Devices | Users | Retention | Key features |
|---|---|---|---|---|---|
| **Free** | $0 | 3 | 1 | 7 days | Monitoring, manual backup |
| **Pro** | $5/device/mo | Unlimited | 5 | 30 days | Config push, alerts, scheduled backup |
| **Business** | $4/device/mo (min $99/mo) | Unlimited | 20 | 90 days | All Pro + API keys, audit log, mass ops |
| **Enterprise** | Custom | Unlimited | Unlimited | 1 year | All Business + SSO, white-label, SLA |

Volume discounts on Pro/Business:
- 1–49 devices: $5/device/mo
- 50–199 devices: $4/device/mo
- 200–499 devices: $3.50/device/mo
- 500+ devices: $3/device/mo (custom contract)

### Reseller / white-label (secondary)

MSPs and ISPs who want to sell the platform under their own brand. They get a 30–40% margin on what they charge their customers.

- Custom domain (`manage.yourisp.com`)
- Logo, colors, no "powered by" branding
- Reseller portal to create and manage child organizations
- Billed monthly based on total devices across all child orgs
- Minimum commitment: $199/month

### Professional services (tertiary)

One-time fees for high-touch work:

- **Migration project** — bulk enroll existing fleet, import config history: $500–$2,000
- **Custom scripting** — RouterOS scripts, automation workflows: $150/hour
- **Onboarding workshop** — 2-hour setup call for enterprise customers: $300

---

## Unit economics

### Target metrics at 100 customers

| Metric | Target |
|---|---|
| Average devices per customer | 35 |
| Average revenue per customer (ARPU) | $125/month |
| Monthly Recurring Revenue (MRR) | $12,500 |
| Annual Recurring Revenue (ARR) | $150,000 |
| Infrastructure cost per device/month | ~$0.15 |
| Gross margin | ~97% |

### Scaling to 1,000 customers

| Metric | Target |
|---|---|
| Average devices per customer | 50 |
| ARPU | $175/month |
| MRR | $175,000 |
| ARR | $2.1M |
| Infra cost (Railway + Cloudflare + R2) | ~$3,000/month |
| Gross margin | ~98% |

Infrastructure scales sub-linearly because:
- TimescaleDB compression reduces storage ~95% after 1 day
- Cloudflare Durable Objects have zero fixed cost (per-request billing)
- R2 backup storage is $0.015/GB with zero egress fees

---

## Revenue levers

### 1. Increase devices per customer (expansion revenue)

Once an ISP is on the platform, every new router they deploy is additional MRR with zero sales effort. This is the best kind of revenue growth — existing customers expanding naturally.

Tactic: trigger an in-app prompt when a customer is within 20% of their enrolled device count vs. their actual device inventory (estimated from their network range scan).

### 2. Upgrade to higher tier

The jump from Free → Pro is gated on config push and scheduled backups — features that save significant time. ISPs who manually backup 50 routers weekly will upgrade to Pro within the first month.

Tactic: in-app "you've triggered 3 manual backups this week — Pro automates this" nudge.

### 3. White-label resellers

A single reseller agreement can bring 20–200 devices at once. The reseller handles sales, support, and billing for their customers — we handle infrastructure. High LTV, zero direct support cost on our end.

Target: 10 resellers in year 1, each averaging 100 devices = 1,000 additional devices at reseller pricing.

### 4. Add-on modules (Phase 3)

Once the core platform is established, add-ons unlock additional revenue without changing the base price:

| Module | Price | Target segment |
|---|---|---|
| Hotspot & Voucher management | +$1/device/mo | ISPs selling hotspot access |
| PPPoE / RADIUS manager | +$1/device/mo | ISPs with PPPoE customers |
| Advanced AI assistant | +$2/device/mo | Enterprise teams |
| Topology map | +$1/device/mo | Complex enterprise networks |

---

## Competitive analysis

| Competitor | Strength | Weakness | Our advantage |
|---|---|---|---|
| **The Dude** (MikroTik) | Free, made by MikroTik | Local only, no cloud, no config push | Cloud-native, multi-tenant, API |
| **PRTG** | Feature-rich, established | Expensive, complex, not MikroTik-specific | MikroTik-native, simpler UX |
| **LibreNMS** | Free, open source | Self-hosted only, no config management | Managed SaaS, zero ops |
| **Zabbix** | Powerful monitoring | Steep learning curve, self-hosted | SaaS, onboarding in minutes |
| **MikroCloud** | MikroTik SaaS | Limited features, no white-label | More features, reseller model |

Our moat is the combination of:
1. **Agent-first connectivity** — works behind any NAT without port forwarding
2. **Safe-mode config push** — config management that can't brick a production router
3. **White-label reseller program** — competitors don't offer this for MikroTik management

---

## Go-to-market

### Phase 1: organic / community

- MikroTik Forum — post detailed tutorials on common ISP pain points, include tool mentions
- Reddit: r/mikrotik, r/homelab, r/sysadmin
- YouTube: "How to manage 50 MikroTik routers from one dashboard" tutorial
- ProductHunt launch on Phase 1 completion

### Phase 2: content & SEO

- Blog: "MikroTik firewall best practices", "RouterOS backup automation" — capture search traffic
- Comparison pages: "vs The Dude", "vs LibreNMS for MikroTik"
- Email newsletter to early users with RouterOS tips + product updates

### Phase 3: partnerships

- MikroTik Certified Consultants directory — partner with consultants who recommend us to their ISP clients
- Distributor partnerships in target markets (Pakistan, Eastern Europe, Latin America — high MikroTik density regions)
- Reseller program launch with dedicated partner portal

---

## Key risks to the business model

**MikroTik builds a competitor:** They already have The Dude and MikroCloud. Mitigation: move fast, build white-label reseller program (sticky), expand to multi-vendor before they can.

**Price sensitivity in target markets:** Many MikroTik users are in price-sensitive regions (Southeast Asia, Eastern Europe, Middle East). $5/device/month may be high. Mitigation: regional pricing (PPP-adjusted), strong free tier to build network effects.

**Churn from feature gaps:** An ISP using us just for monitoring will leave if a free alternative covers their use case. Mitigation: get them to config push and scheduled backups within the first 30 days — those features have high switching cost.
