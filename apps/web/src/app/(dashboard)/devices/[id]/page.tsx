"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Cpu,
  HardDrive,
  Clock,
  Network,
  Activity,
  AlertTriangle,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DeviceStatusBadge } from "@/components/device-status-badge";
import type { DeviceStatus } from "@mikrotik/types";

type Tab = "overview" | "metrics" | "config" | "alerts";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "metrics", label: "Metrics", icon: Activity },
  { id: "config", label: "Config", icon: Settings },
  { id: "alerts", label: "Alerts", icon: AlertTriangle },
];

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ") || "< 1m";
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[oklch(20%_0.012_250)] last:border-0">
      <span className="text-sm text-[oklch(55%_0.006_250)]">{label}</span>
      <span className="text-right text-sm font-medium text-[oklch(82%_0.006_250)]">
        {value}
      </span>
    </div>
  );
}

export default function DeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const { data: device, isLoading, isError } = trpc.devices.get.useQuery(
    { id: params.id },
    { enabled: Boolean(params.id) }
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <svg
          className="h-6 w-6 animate-spin text-[oklch(54%_0.18_250)]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-label="Loading"
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
      </div>
    );
  }

  if (isError || !device) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <p className="text-sm text-[oklch(70%_0.16_25)]">Device not found.</p>
        <button
          onClick={() => router.push("/devices")}
          className="text-xs text-[oklch(54%_0.18_250)] hover:underline"
        >
          Back to devices
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Breadcrumb */}
      <button
        type="button"
        onClick={() => router.push("/devices")}
        className="mb-4 flex items-center gap-1.5 text-sm text-[oklch(55%_0.006_250)] transition hover:text-[oklch(80%_0.006_250)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to devices
      </button>

      {/* Page header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[oklch(92%_0.006_250)]">
            {device.name}
          </h1>
          <DeviceStatusBadge
            status={device.status as DeviceStatus}
            showPulse
          />
        </div>
        <span className="text-xs text-[oklch(45%_0.006_250)]">
          ID: <span className="font-mono">{device.id}</span>
        </span>
      </div>

      {/* Device info card */}
      <div className="mb-6 rounded-xl border border-[oklch(22%_0.012_250)] bg-[oklch(16%_0.01_250)] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[oklch(75%_0.006_250)]">
          Device information
        </h2>
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <InfoRow label="Model" value={device.model ?? "—"} />
            <InfoRow
              label="RouterOS version"
              value={device.routerOsVersion ?? "—"}
            />
            <InfoRow
              label="Connection type"
              value={
                <span className="rounded-md bg-[oklch(22%_0.012_250)] px-2 py-0.5 text-xs">
                  {device.connectionType}
                </span>
              }
            />
            <InfoRow
              label="IP address"
              value={
                <span className="font-mono text-xs">
                  {device.ipAddress ?? "—"}
                </span>
              }
            />
          </div>
          <div>
            <InfoRow
              label="Uptime"
              value={
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[oklch(54%_0.18_250)]" />
                  {formatUptime(device.uptimeSeconds)}
                </span>
              }
            />
            <InfoRow label="MAC address" value={device.macAddress ?? "—"} />
            <InfoRow
              label="CPU load"
              value={
                device.lastCpuLoad != null ? (
                  <span className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-[oklch(54%_0.18_250)]" />
                    {device.lastCpuLoad}%
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <InfoRow
              label="Free memory"
              value={
                device.lastFreeMemory != null && device.lastTotalMemory != null ? (
                  <span className="flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-[oklch(54%_0.18_250)]" />
                    {Math.round(device.lastFreeMemory / 1024 / 1024)} /{" "}
                    {Math.round(device.lastTotalMemory / 1024 / 1024)} MiB
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-[oklch(22%_0.012_250)] bg-[oklch(16%_0.01_250)] p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === id
                ? "bg-[oklch(22%_0.012_250)] text-[oklch(85%_0.006_250)]"
                : "text-[oklch(55%_0.006_250)] hover:text-[oklch(75%_0.006_250)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl border border-[oklch(22%_0.012_250)] bg-[oklch(16%_0.01_250)] p-5">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                icon: Cpu,
                label: "CPU",
                value:
                  device.lastCpuLoad != null
                    ? `${device.lastCpuLoad}%`
                    : "N/A",
              },
              {
                icon: HardDrive,
                label: "Memory",
                value:
                  device.lastFreeMemory != null && device.lastTotalMemory != null
                    ? `${Math.round((1 - device.lastFreeMemory / device.lastTotalMemory) * 100)}%`
                    : "N/A",
              },
              {
                icon: Network,
                label: "Interfaces",
                value: device.interfaceCount ?? "N/A",
              },
            ].map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex flex-col gap-1 rounded-lg bg-[oklch(20%_0.012_250)] p-4"
              >
                <div className="flex items-center gap-2 text-xs text-[oklch(55%_0.006_250)]">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </div>
                <span className="text-2xl font-semibold text-[oklch(88%_0.006_250)]">
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "metrics" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Activity className="h-10 w-10 text-[oklch(35%_0.006_250)]" />
            <p className="text-sm font-medium text-[oklch(60%_0.006_250)]">
              Metric charts
            </p>
            <p className="max-w-xs text-center text-xs text-[oklch(45%_0.006_250)]">
              Time-series charts for CPU, memory, and interface traffic will
              render here once the metrics ingestion pipeline is wired up.
            </p>
          </div>
        )}

        {activeTab === "config" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Settings className="h-10 w-10 text-[oklch(35%_0.006_250)]" />
            <p className="text-sm font-medium text-[oklch(60%_0.006_250)]">
              Configuration backups
            </p>
            <p className="max-w-xs text-center text-xs text-[oklch(45%_0.006_250)]">
              RouterOS configuration snapshots and diff viewer will appear here.
            </p>
          </div>
        )}

        {activeTab === "alerts" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <AlertTriangle className="h-10 w-10 text-[oklch(35%_0.006_250)]" />
            <p className="text-sm font-medium text-[oklch(60%_0.006_250)]">
              Alert rules
            </p>
            <p className="max-w-xs text-center text-xs text-[oklch(45%_0.006_250)]">
              Alert rules targeting this device will be listed and managed here.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
