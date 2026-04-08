'use client'

import type { ConnectionType, WizardFormData } from './use-wizard-state'

interface Props {
  formData: WizardFormData
  updateFormData: (data: Partial<WizardFormData>) => void
}

const OPTIONS: { type: ConnectionType; title: string; desc: string; badge?: string; defaultPort: number }[] = [
  { type: 'agent', title: 'Agent Tunnel', desc: 'Works behind NAT/firewall. A lightweight agent tunnels outbound via WebSocket.', badge: 'Recommended', defaultPort: 0 },
  { type: 'rest', title: 'REST API', desc: 'RouterOS v7+ with a public IP. Direct HTTPS connection on port 443.', defaultPort: 443 },
  { type: 'binary_api', title: 'Binary API', desc: 'RouterOS API protocol on TCP 8728. Works with v6 and v7.', defaultPort: 8728 },
  { type: 'snmp', title: 'SNMP', desc: 'Read-only monitoring via SNMP polling. No config push capability.', defaultPort: 161 },
]

export function StepConnectionType({ formData, updateFormData }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {OPTIONS.map((opt) => {
        const selected = formData.connectionType === opt.type
        return (
          <button
            key={opt.type}
            type="button"
            onClick={() => updateFormData({ connectionType: opt.type, port: opt.defaultPort })}
            className={`relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all ${
              selected
                ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500'
                : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
            }`}
          >
            {opt.badge && (
              <span className="absolute -top-2.5 right-3 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                {opt.badge}
              </span>
            )}
            <span className="text-sm font-semibold text-zinc-100">{opt.title}</span>
            <span className="text-xs text-zinc-400 leading-relaxed">{opt.desc}</span>
          </button>
        )
      })}
    </div>
  )
}
