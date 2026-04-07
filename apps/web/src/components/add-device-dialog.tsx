"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { ConnectionType } from "@mikrotik/types";

interface AddDeviceDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const connectionTypes: { value: ConnectionType; label: string }[] = [
  { value: "agent", label: "Agent" },
  { value: "rest", label: "REST API" },
  { value: "binary_api", label: "Binary API" },
  { value: "snmp", label: "SNMP" },
];

export function AddDeviceDialog({
  open,
  onClose,
  onSuccess,
}: AddDeviceDialogProps) {
  const [name, setName] = useState("");
  const [connectionType, setConnectionType] = useState<ConnectionType>("agent");
  const [ipAddress, setIpAddress] = useState("");
  const [apiPort, setApiPort] = useState("");
  const [description, setDescription] = useState("");

  const utils = trpc.useUtils();

  const addDevice = trpc.devices.add.useMutation({
    onSuccess() {
      void utils.devices.list.invalidate();
      resetForm();
      onSuccess?.();
      onClose();
    },
  });

  function resetForm() {
    setName("");
    setConnectionType("agent");
    setIpAddress("");
    setApiPort("");
    setDescription("");
  }

  function handleClose() {
    resetForm();
    addDevice.reset();
    onClose();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    addDevice.mutate({
      name,
      connectionType,
      ipAddress: ipAddress || undefined,
      apiPort: apiPort ? parseInt(apiPort, 10) : undefined,
      description: description || undefined,
    });
  }

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-device-title"
    >
      {/* Panel */}
      <div className="w-full max-w-md rounded-2xl border border-[oklch(25%_0.013_250)] bg-[oklch(16%_0.01_250)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[oklch(22%_0.012_250)] px-6 py-4">
          <h2
            id="add-device-title"
            className="text-base font-semibold text-[oklch(92%_0.006_250)]"
          >
            Add device
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
            className="rounded-md p-1 text-[oklch(55%_0.006_250)] transition hover:bg-[oklch(22%_0.012_250)] hover:text-[oklch(80%_0.006_250)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          {addDevice.error && (
            <div
              role="alert"
              className="rounded-lg border border-[oklch(55%_0.22_25)/0.3] bg-[oklch(55%_0.22_25)/0.1] px-3 py-2 text-sm text-[oklch(75%_0.16_25)]"
            >
              {addDevice.error.message}
            </div>
          )}

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="device-name"
              className="text-sm font-medium text-[oklch(80%_0.006_250)]"
            >
              Name <span className="text-[oklch(55%_0.22_25)]">*</span>
            </label>
            <input
              id="device-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Core Router 01"
              className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] placeholder:text-[oklch(45%_0.006_250)] outline-none transition focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
              disabled={addDevice.isPending}
            />
          </div>

          {/* Connection type */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="connection-type"
              className="text-sm font-medium text-[oklch(80%_0.006_250)]"
            >
              Connection type <span className="text-[oklch(55%_0.22_25)]">*</span>
            </label>
            <select
              id="connection-type"
              required
              value={connectionType}
              onChange={(e) =>
                setConnectionType(e.target.value as ConnectionType)
              }
              className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] outline-none transition focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
              disabled={addDevice.isPending}
            >
              {connectionTypes.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* IP address */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ip-address"
              className="text-sm font-medium text-[oklch(80%_0.006_250)]"
            >
              IP address
            </label>
            <input
              id="ip-address"
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="192.168.1.1"
              className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] placeholder:text-[oklch(45%_0.006_250)] outline-none transition focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
              disabled={addDevice.isPending}
            />
          </div>

          {/* API port */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="api-port"
              className="text-sm font-medium text-[oklch(80%_0.006_250)]"
            >
              API port
            </label>
            <input
              id="api-port"
              type="number"
              min={1}
              max={65535}
              value={apiPort}
              onChange={(e) => setApiPort(e.target.value)}
              placeholder="8728"
              className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] placeholder:text-[oklch(45%_0.006_250)] outline-none transition focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
              disabled={addDevice.isPending}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="description"
              className="text-sm font-medium text-[oklch(80%_0.006_250)]"
            >
              Description
            </label>
            <textarea
              id="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this device…"
              className="resize-none rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] placeholder:text-[oklch(45%_0.006_250)] outline-none transition focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
              disabled={addDevice.isPending}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-[oklch(25%_0.013_250)] px-4 py-2 text-sm font-medium text-[oklch(70%_0.006_250)] transition hover:bg-[oklch(22%_0.012_250)] hover:text-[oklch(85%_0.006_250)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addDevice.isPending}
              className="flex items-center gap-2 rounded-lg bg-[oklch(46%_0.19_250)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[oklch(54%_0.18_250)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addDevice.isPending ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Adding…
                </>
              ) : (
                "Add device"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
