'use client'

import type { WizardStep } from './use-wizard-state'

const STEPS = ['Basic Info', 'Connection', 'Details', 'Confirm'] as const

export function WizardStepper({ currentStep }: { currentStep: WizardStep }) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      {STEPS.map((label, i) => {
        const stepNum = (i + 1) as WizardStep
        const isActive = stepNum === currentStep
        const isCompleted = stepNum < currentStep

        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  isCompleted
                    ? 'bg-emerald-600 text-white'
                    : isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-700 text-zinc-400'
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span className={`text-xs ${isActive ? 'text-zinc-100' : 'text-zinc-500'}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`mx-2 h-px flex-1 ${isCompleted ? 'bg-emerald-600' : 'bg-zinc-700'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
