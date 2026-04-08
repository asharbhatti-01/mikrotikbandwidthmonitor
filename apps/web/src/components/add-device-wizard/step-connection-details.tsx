'use client'

import { useState, useEffect } from 'react'
import type { WizardFormData, TestResult } from './use-wizard-state'
import { trpc } from '@/lib/trpc'

interface Props {
  formData: WizardFormData
  updateFormData: (data: Partial<WizardFormData>) => void
  testResult: TestResult | null
  setTestResult: (r: TestResult | null) => void
  enrollmentToken: string | null
  setEnrollmentToken: (t: string | null) => void
  createdDeviceId: string | null
  setCreatedDeviceId: (id: string | null) => void
}

export function StepConnectionDetails(props: Props) {
  const { formData } = props
  switch (formData.connectionType) {
    case 'agent':
      return <AgentForm {...props} />
    case 'rest':
    case 'binary_api':
      return <DirectConnectionForm {...props} />
    case 'snmp':
      return <SnmpForm {...props} />
  }
}

function AgentForm({ formData, createdDeviceId, setCreatedDeviceId, enrollmentToken, setEnrollmentToken }: Props) {
  const addDevice = trpc.devices.add.useMutation()
  const generateToken = trpc.devices.generateEnrollToken.useMutation()
  const [installCmd, setInstallCmd] = useState('')
  const [copied, setCopied] = useState(false)

  // Create device and generate token on mount
  useEffect(() => {
    if (createdDeviceId || addDevice.isPending) return
    addDevice.mutate(
      { name: formData.name, connectionType: 'agent', description: formData.description, tags: formData.tags, siteId: formData.siteId ?? undefined },
      {
        onSuccess: (device) => {
          setCreatedDeviceId(device.id)
          generateToken.mutate(
            { deviceId: device.id },
            {
              onSuccess: (data) => {
                setEnrollmentToken(data.token)
                setInstallCmd(data.installCommand)
              },
            },
          )
        },
      },
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const enrollment = trpc.devices.checkEnrollment.useQuery(
    { deviceId: createdDeviceId! },
    { enabled: !!createdDeviceId, refetchInterval: 3000 },
  )

  function copyToClipboard() {
    navigator.clipboard.writeText(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!enrollmentToken) {
    return <div className="flex items-center justify-center py-8 text-zinc-400">Setting up device...</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">Run this command on the router or any Linux box on the same network:</p>
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-emerald-400 font-mono">
          {installCmd}
        </pre>
        <button
          onClick={copyToClipboard}
          className="absolute right-2 top-2 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
        {enrollment.data?.enrolled ? (
          <>
            <div className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-sm text-emerald-400">Agent connected — {enrollment.data.agentVersion ?? 'unknown version'}</span>
          </>
        ) : (
          <>
            <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-zinc-400">Waiting for agent to connect...</span>
          </>
        )}
      </div>
    </div>
  )
}

function DirectConnectionForm({ formData, updateFormData, testResult, setTestResult }: Props) {
  const testConn = trpc.devices.testConnection.useMutation()
  const isRest = formData.connectionType === 'rest'

  function handleTest() {
    setTestResult(null)
    testConn.mutate(
      {
        connectionType: formData.connectionType,
        ipAddress: formData.ipAddress,
        port: formData.port,
        username: formData.username,
        password: formData.password,
      },
      { onSuccess: (r) => setTestResult(r as TestResult) },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-300">IP Address *</label>
          <input
            type="text"
            value={formData.ipAddress}
            onChange={(e) => updateFormData({ ipAddress: e.target.value })}
            placeholder="192.168.1.1"
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-600"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-300">Port</label>
          <input
            type="number"
            value={formData.port}
            onChange={(e) => updateFormData({ port: Number(e.target.value) })}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-600"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-300">Username</label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => updateFormData({ username: e.target.value })}
            placeholder="admin"
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-600"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-300">Password</label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => updateFormData({ password: e.target.value })}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-600"
          />
        </div>
      </div>

      <button
        onClick={handleTest}
        disabled={!formData.ipAddress || testConn.isPending}
        className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {testConn.isPending ? 'Testing...' : 'Test Connection'}
      </button>

      {testResult && (
        <div className={`rounded-lg border p-3 text-sm ${testResult.success ? 'border-emerald-800 bg-emerald-950/30 text-emerald-400' : 'border-red-800 bg-red-950/30 text-red-400'}`}>
          {testResult.success ? (
            <div className="flex flex-col gap-1">
              <span className="font-medium">Connected successfully</span>
              {testResult.rosVersion && <span>RouterOS: {testResult.rosVersion}</span>}
              {testResult.boardName && <span>Board: {testResult.boardName}</span>}
              {testResult.model && <span>Platform: {testResult.model}</span>}
            </div>
          ) : (
            <span>{testResult.error ?? 'Connection failed'}</span>
          )}
        </div>
      )}
    </div>
  )
}

function SnmpForm({ formData, updateFormData, testResult, setTestResult }: Props) {
  const testConn = trpc.devices.testConnection.useMutation()

  function handleTest() {
    setTestResult(null)
    testConn.mutate(
      {
        connectionType: 'snmp',
        ipAddress: formData.ipAddress,
        snmpCommunity: formData.snmpCommunity,
        snmpVersion: formData.snmpVersion,
      },
      { onSuccess: (r) => setTestResult(r as TestResult) },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-300">IP Address *</label>
        <input
          type="text"
          value={formData.ipAddress}
          onChange={(e) => updateFormData({ ipAddress: e.target.value })}
          placeholder="192.168.1.1"
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-600"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-300">Community String</label>
          <input
            type="text"
            value={formData.snmpCommunity}
            onChange={(e) => updateFormData({ snmpCommunity: e.target.value })}
            placeholder="public"
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-600"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-300">SNMP Version</label>
          <select
            value={formData.snmpVersion}
            onChange={(e) => updateFormData({ snmpVersion: e.target.value as 'v2c' | 'v3' })}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-600"
          >
            <option value="v2c">v2c</option>
            <option value="v3">v3</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleTest}
        disabled={!formData.ipAddress || testConn.isPending}
        className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {testConn.isPending ? 'Testing...' : 'Test Connection'}
      </button>

      {testResult && (
        <div className={`rounded-lg border p-3 text-sm ${testResult.success ? 'border-emerald-800 bg-emerald-950/30 text-emerald-400' : 'border-red-800 bg-red-950/30 text-red-400'}`}>
          {testResult.success ? (
            <span>SNMP OK{testResult.rosVersion ? ` — RouterOS ${testResult.rosVersion}` : ''}</span>
          ) : (
            <span>{testResult.error ?? 'Connection failed'}</span>
          )}
        </div>
      )}
    </div>
  )
}
