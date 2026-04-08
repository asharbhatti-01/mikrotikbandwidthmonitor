'use client'

import type { WizardFormData, TestResult } from './use-wizard-state'
import { trpc } from '@/lib/trpc'

interface Props {
  formData: WizardFormData
  testResult: TestResult | null
  createdDeviceId: string | null
  onFinish: () => void
}

const TYPE_LABELS: Record<string, string> = {
  agent: 'Agent Tunnel',
  rest: 'REST API',
  binary_api: 'Binary API',
  snmp: 'SNMP',
}

export function StepConfirmation({ formData, testResult, createdDeviceId, onFinish }: Props) {
  const addDevice = trpc.devices.add.useMutation()
  const utils = trpc.useUtils()
  const isAgent = formData.connectionType === 'agent'

  async function handleFinish() {
    if (!isAgent) {
      await addDevice.mutateAsync({
        name: formData.name,
        connectionType: formData.connectionType,
        ipAddress: formData.ipAddress,
        apiPort: formData.port,
        description: formData.description,
        tags: formData.tags,
        siteId: formData.siteId ?? undefined,
      })
    }
    utils.devices.list.invalidate()
    onFinish()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">Device Summary</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-500">Name</dt>
          <dd className="text-zinc-100">{formData.name}</dd>
          {formData.description && (
            <>
              <dt className="text-zinc-500">Description</dt>
              <dd className="text-zinc-100">{formData.description}</dd>
            </>
          )}
          <dt className="text-zinc-500">Connection</dt>
          <dd className="text-zinc-100">{TYPE_LABELS[formData.connectionType]}</dd>
          {formData.ipAddress && (
            <>
              <dt className="text-zinc-500">IP Address</dt>
              <dd className="text-zinc-100">{formData.ipAddress}:{formData.port}</dd>
            </>
          )}
          {testResult?.rosVersion && (
            <>
              <dt className="text-zinc-500">RouterOS</dt>
              <dd className="text-zinc-100">{testResult.rosVersion}</dd>
            </>
          )}
          {testResult?.boardName && (
            <>
              <dt className="text-zinc-500">Board</dt>
              <dd className="text-zinc-100">{testResult.boardName}</dd>
            </>
          )}
          {formData.tags.length > 0 && (
            <>
              <dt className="text-zinc-500">Tags</dt>
              <dd className="flex flex-wrap gap-1">
                {formData.tags.map((t) => (
                  <span key={t} className="rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">{t}</span>
                ))}
              </dd>
            </>
          )}
          <dt className="text-zinc-500">Status</dt>
          <dd>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${testResult?.success || isAgent ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`h-2 w-2 rounded-full ${testResult?.success || isAgent ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {testResult?.success ? 'Connected' : isAgent ? 'Agent Pending' : 'Not Tested'}
            </span>
          </dd>
        </dl>
      </div>

      <button
        onClick={handleFinish}
        disabled={addDevice.isPending}
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {addDevice.isPending ? 'Adding...' : isAgent ? 'Done' : 'Add Device'}
      </button>
    </div>
  )
}
