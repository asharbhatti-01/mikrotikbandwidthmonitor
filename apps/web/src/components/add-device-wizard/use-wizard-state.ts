'use client'

import { useState, useCallback } from 'react'

export type WizardStep = 1 | 2 | 3 | 4
export type ConnectionType = 'agent' | 'rest' | 'binary_api' | 'snmp'

export interface WizardFormData {
  name: string
  description: string
  siteId: string | null
  tags: string[]
  connectionType: ConnectionType
  ipAddress: string
  port: number
  username: string
  password: string
  sshKey: string
  authMethod: 'password' | 'key'
  snmpCommunity: string
  snmpVersion: 'v2c' | 'v3'
}

export interface TestResult {
  success: boolean
  rosVersion?: string
  boardName?: string
  model?: string
  error?: string
}

const INITIAL_FORM: WizardFormData = {
  name: '',
  description: '',
  siteId: null,
  tags: [],
  connectionType: 'rest',
  ipAddress: '',
  port: 443,
  username: 'admin',
  password: '',
  sshKey: '',
  authMethod: 'password',
  snmpCommunity: 'public',
  snmpVersion: 'v2c',
}

export function useWizardState() {
  const [step, setStep] = useState<WizardStep>(1)
  const [formData, setFormData] = useState<WizardFormData>(INITIAL_FORM)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null)
  const [createdDeviceId, setCreatedDeviceId] = useState<string | null>(null)

  const updateFormData = useCallback((partial: Partial<WizardFormData>) => {
    setFormData((prev) => ({ ...prev, ...partial }))
  }, [])

  const canGoNext = useCallback(() => {
    switch (step) {
      case 1:
        return formData.name.trim().length > 0
      case 2:
        return true // connection type always has a default
      case 3:
        if (formData.connectionType === 'agent') return true // can proceed once token generated
        return testResult?.success === true
      case 4:
        return true
      default:
        return false
    }
  }, [step, formData, testResult])

  const goNext = useCallback(() => {
    if (step < 4 && canGoNext()) setStep((s) => (s + 1) as WizardStep)
  }, [step, canGoNext])

  const goBack = useCallback(() => {
    if (step > 1) setStep((s) => (s - 1) as WizardStep)
  }, [step])

  const reset = useCallback(() => {
    setStep(1)
    setFormData(INITIAL_FORM)
    setTestResult(null)
    setEnrollmentToken(null)
    setCreatedDeviceId(null)
  }, [])

  return {
    step,
    formData,
    updateFormData,
    testResult,
    setTestResult,
    enrollmentToken,
    setEnrollmentToken,
    createdDeviceId,
    setCreatedDeviceId,
    canGoNext,
    goNext,
    goBack,
    reset,
  }
}
