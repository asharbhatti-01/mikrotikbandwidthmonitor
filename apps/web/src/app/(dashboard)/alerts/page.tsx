"use client";

import { useState, type FormEvent } from "react";
import { Plus, Bell, Trash2, ToggleLeft, ToggleRight, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { AlertChannel, AlertOperator } from "@mikrotik/types";

const OPERATORS: { value: AlertOperator; label: string }[] = [
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "eq", label: "=" },
];

const CHANNELS: { value: AlertChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "webhook", label: "Webhook" },
  { value: "slack", label: "Slack" },
];

interface CreateRuleFormState {
  name: string;
  metric: string;
  operator: AlertOperator;
  threshold: string;
  channels: AlertChannel[];
  cooldownMinutes: string;
}

const INITIAL_FORM: CreateRuleFormState = {
  name: "",
  metric: "cpu",
  operator: "gt",
  threshold: "80",
  channels: ["email"],
  cooldownMinutes: "15",
};

function CreateRuleDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreateRuleFormState>(INITIAL_FORM);
  const utils = trpc.useUtils();

  const createRule = trpc.alerts.create.useMutation({
    onSuccess() {
      void utils.alerts.list.invalidate();
      setForm(INITIAL_FORM);
      onClose();
    },
  });

  function toggleChannel(ch: AlertChannel) {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter((c) => c !== ch)
        : [...prev.channels, ch],
    }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.channels.length === 0) return;
    createRule.mutate({
      name: form.name,
      metric: form.metric,
      operator: form.operator,
      threshold: parseFloat(form.threshold),
      channels: form.channels,
      cooldownMinutes: parseInt(form.cooldownMinutes, 10),
      enabled: true,
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-rule-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[oklch(25%_0.013_250)] bg-[oklch(16%_0.01_250)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[oklch(22%_0.012_250)] px-6 py-4">
          <h2 id="create-rule-title" className="text-base font-semibold text-[oklch(92%_0.006_250)]">
            Create alert rule
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-[oklch(55%_0.006_250)] hover:bg-[oklch(22%_0.012_250)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          {createRule.error && (
            <div role="alert" className="rounded-lg border border-[oklch(55%_0.22_25)/0.3] bg-[oklch(55%_0.22_25)/0.1] px-3 py-2 text-sm text-[oklch(75%_0.16_25)]">
              {createRule.error.message}
            </div>
          )}

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rule-name" className="text-sm font-medium text-[oklch(80%_0.006_250)]">
              Rule name <span className="text-[oklch(55%_0.22_25)]">*</span>
            </label>
            <input
              id="rule-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="High CPU alert"
              className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] placeholder:text-[oklch(45%_0.006_250)] outline-none focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
            />
          </div>

          {/* Metric + operator + threshold */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[oklch(80%_0.006_250)]">
              Condition <span className="text-[oklch(55%_0.22_25)]">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={form.metric}
                onChange={(e) => setForm((p) => ({ ...p, metric: e.target.value }))}
                placeholder="cpu"
                className="flex-1 rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] placeholder:text-[oklch(45%_0.006_250)] outline-none focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
              />
              <select
                value={form.operator}
                onChange={(e) => setForm((p) => ({ ...p, operator: e.target.value as AlertOperator }))}
                className="w-20 rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-2 py-2 text-sm text-[oklch(92%_0.006_250)] outline-none focus:border-[oklch(54%_0.18_250)]"
              >
                {OPERATORS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <input
                type="number"
                required
                value={form.threshold}
                onChange={(e) => setForm((p) => ({ ...p, threshold: e.target.value }))}
                placeholder="80"
                className="w-24 rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] outline-none focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
              />
            </div>
          </div>

          {/* Channels */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[oklch(80%_0.006_250)]">
              Notify via
            </label>
            <div className="flex gap-2">
              {CHANNELS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleChannel(value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    form.channels.includes(value)
                      ? "border-[oklch(46%_0.19_250)] bg-[oklch(46%_0.19_250)/0.2] text-[oklch(65%_0.14_250)]"
                      : "border-[oklch(25%_0.013_250)] text-[oklch(55%_0.006_250)] hover:bg-[oklch(22%_0.012_250)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {form.channels.length === 0 && (
              <p className="text-xs text-[oklch(70%_0.16_25)]">Select at least one channel.</p>
            )}
          </div>

          {/* Cooldown */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cooldown" className="text-sm font-medium text-[oklch(80%_0.006_250)]">
              Cooldown (minutes)
            </label>
            <input
              id="cooldown"
              type="number"
              min={1}
              max={1440}
              value={form.cooldownMinutes}
              onChange={(e) => setForm((p) => ({ ...p, cooldownMinutes: e.target.value }))}
              className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] outline-none focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-[oklch(25%_0.013_250)] px-4 py-2 text-sm font-medium text-[oklch(70%_0.006_250)] hover:bg-[oklch(22%_0.012_250)]">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createRule.isPending || form.channels.length === 0}
              className="rounded-lg bg-[oklch(46%_0.19_250)] px-4 py-2 text-sm font-medium text-white hover:bg-[oklch(54%_0.18_250)] disabled:opacity-50"
            >
              {createRule.isPending ? "Creating…" : "Create rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = trpc.alerts.list.useQuery({ limit: 50 });
  const utils = trpc.useUtils();

  const deleteRule = trpc.alerts.delete.useMutation({
    onSuccess: () => void utils.alerts.list.invalidate(),
  });

  const toggleRule = trpc.alerts.update.useMutation({
    onSuccess: () => void utils.alerts.list.invalidate(),
  });

  const rules = data?.items ?? [];

  return (
    <>
      <CreateRuleDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[oklch(92%_0.006_250)]">Alerts</h1>
          <p className="mt-0.5 text-sm text-[oklch(55%_0.006_250)]">
            Define threshold rules and notification channels.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-[oklch(46%_0.19_250)] px-4 py-2 text-sm font-medium text-white hover:bg-[oklch(54%_0.18_250)]"
        >
          <Plus className="h-4 w-4" />
          Create rule
        </button>
      </div>

      <div className="rounded-xl border border-[oklch(22%_0.012_250)] bg-[oklch(16%_0.01_250)]">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <svg className="h-5 w-5 animate-spin text-[oklch(54%_0.18_250)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-label="Loading">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Bell className="h-10 w-10 text-[oklch(35%_0.006_250)]" />
            <p className="text-sm text-[oklch(55%_0.006_250)]">No alert rules yet.</p>
            <button type="button" onClick={() => setCreateOpen(true)} className="text-xs font-medium text-[oklch(54%_0.18_250)] hover:underline">
              Create your first rule
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-[oklch(20%_0.012_250)]">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-[oklch(18%_0.011_250)]">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="truncate text-sm font-medium text-[oklch(85%_0.006_250)]">{rule.name}</span>
                  <span className="text-xs text-[oklch(50%_0.006_250)]">
                    {rule.metric} {rule.operator} {rule.threshold} &bull; cooldown {rule.cooldownMinutes}m
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rule.enabled ? "bg-[oklch(64%_0.18_145)/0.15] text-[oklch(72%_0.18_145)]" : "bg-[oklch(22%_0.012_250)] text-[oklch(50%_0.006_250)]"}`}>
                    {rule.enabled ? "Active" : "Paused"}
                  </span>
                  <button
                    type="button"
                    aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
                    onClick={() => toggleRule.mutate({ id: rule.id, enabled: !rule.enabled })}
                    className="text-[oklch(55%_0.006_250)] transition hover:text-[oklch(80%_0.006_250)]"
                  >
                    {rule.enabled ? <ToggleRight className="h-5 w-5 text-[oklch(54%_0.18_250)]" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete rule"
                    onClick={() => deleteRule.mutate({ id: rule.id })}
                    className="text-[oklch(50%_0.006_250)] transition hover:text-[oklch(70%_0.16_25)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
