'use client'

import { useWizardState } from './use-wizard-state'
import { WizardStepper } from './wizard-stepper'
import { StepBasicInfo } from './step-basic-info'
import { StepConnectionType } from './step-connection-type'
import { StepConnectionDetails } from './step-connection-details'
import { StepConfirmation } from './step-confirmation'

interface Props {
  open: boolean
  onClose: () => void
}

export function AddDeviceWizard({ open, onClose }: Props) {
  const wizard = useWizardState()

  function handleClose() {
    wizard.reset()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-100">Add Device</h2>
          <button onClick={handleClose} className="text-zinc-500 hover:text-zinc-300">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stepper */}
        <div className="border-b border-zinc-800 px-6">
          <WizardStepper currentStep={wizard.step} />
        </div>

        {/* Content */}
        <div className="px-6 py-5 min-h-[280px]">
          {wizard.step === 1 && (
            <StepBasicInfo formData={wizard.formData} updateFormData={wizard.updateFormData} />
          )}
          {wizard.step === 2 && (
            <StepConnectionType formData={wizard.formData} updateFormData={wizard.updateFormData} />
          )}
          {wizard.step === 3 && (
            <StepConnectionDetails
              formData={wizard.formData}
              updateFormData={wizard.updateFormData}
              testResult={wizard.testResult}
              setTestResult={wizard.setTestResult}
              enrollmentToken={wizard.enrollmentToken}
              setEnrollmentToken={wizard.setEnrollmentToken}
              createdDeviceId={wizard.createdDeviceId}
              setCreatedDeviceId={wizard.setCreatedDeviceId}
            />
          )}
          {wizard.step === 4 && (
            <StepConfirmation
              formData={wizard.formData}
              testResult={wizard.testResult}
              createdDeviceId={wizard.createdDeviceId}
              onFinish={handleClose}
            />
          )}
        </div>

        {/* Footer */}
        {wizard.step < 4 && (
          <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-4">
            <button
              onClick={wizard.goBack}
              disabled={wizard.step === 1}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
            >
              Back
            </button>
            <button
              onClick={wizard.goNext}
              disabled={!wizard.canGoNext()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
