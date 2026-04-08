'use client'

import { useState, type KeyboardEvent } from 'react'
import type { WizardFormData } from './use-wizard-state'

interface Props {
  formData: WizardFormData
  updateFormData: (data: Partial<WizardFormData>) => void
}

export function StepBasicInfo({ formData, updateFormData }: Props) {
  const [tagInput, setTagInput] = useState('')

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const tag = tagInput.trim().replace(/,/g, '')
      if (tag && !formData.tags.includes(tag)) {
        updateFormData({ tags: [...formData.tags, tag] })
      }
      setTagInput('')
    }
  }

  function removeTag(tag: string) {
    updateFormData({ tags: formData.tags.filter((t) => t !== tag) })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-300">Device Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => updateFormData({ name: e.target.value })}
          placeholder="e.g. Branch Office Router"
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-300">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => updateFormData({ description: e.target.value })}
          placeholder="Optional notes about this device..."
          rows={2}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 resize-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-300">Tags</label>
        <div className="flex flex-wrap gap-1.5 mb-1">
          {formData.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
              {tag}
              <button onClick={() => removeTag(tag)} className="text-zinc-500 hover:text-zinc-200">&times;</button>
            </span>
          ))}
        </div>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="Type a tag and press Enter..."
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        />
      </div>
    </div>
  )
}
