"use client";

import { useState } from "react";
import { Search, Plus, RefreshCw, MonitorSmartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DeviceStatusBadge } from "@/components/device-status-badge";
import { AddDeviceWizard } from "@/components/add-device-wizard";
import type { DeviceStatus } from "@mikrotik/types";

const STATUS_OPTIONS: { value: DeviceStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "warning", label: "Warning" },
  { value: "unreachable", label: "Unreachable" },
];

export default function DevicesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | "all">(
    "all"
  );
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } =
    trpc.devices.list.useQuery({
      search: search || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: 50,
    });

  const devices = data?.items ?? [];

  function formatLastSeen(ts: string | Date | null | undefined): string {
    if (!ts) return "Never";
    const date = ts instanceof Date ? ts : new Date(ts);
    const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSecs < 60) return "Just now";
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    return `${Math.floor(diffSecs / 86400)}d ago`;
  }

  return (
    <>
      <AddDeviceWizard open={addOpen} onClose={() => setAddOpen(false)} />

      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[oklch(92%_0.006_250)]">
            Devices
          </h1>
          <p className="mt-0.5 text-sm text-[oklch(55%_0.006_250)]">
            Manage and monitor your MikroTik fleet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Refresh device list"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(18%_0.011_250)] text-[oklch(65%_0.006_250)] transition hover:bg-[oklch(22%_0.012_250)] hover:text-[oklch(85%_0.006_250)] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-[oklch(46%_0.19_250)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[oklch(54%_0.18_250)]"
          >
            <Plus className="h-4 w-4" />
            Add device
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[oklch(50%_0.006_250)]" />
          <input
            type="search"
            placeholder="Search by name or IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(18%_0.011_250)] py-2 pl-9 pr-3 text-sm text-[oklch(85%_0.006_250)] placeholder:text-[oklch(45%_0.006_250)] outline-none transition focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as DeviceStatus | "all")
          }
          className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(18%_0.011_250)] px-3 py-2 text-sm text-[oklch(85%_0.006_250)] outline-none transition focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25] sm:w-44"
        >
          {STATUS_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[oklch(22%_0.012_250)] bg-[oklch(16%_0.01_250)]">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
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
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-[oklch(70%_0.16_25)]">
            <p>Failed to load devices.</p>
            <button
              onClick={() => void refetch()}
              className="text-xs text-[oklch(54%_0.18_250)] hover:underline"
            >
              Retry
            </button>
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <MonitorSmartphone className="h-10 w-10 text-[oklch(35%_0.006_250)]" />
            <p className="text-sm text-[oklch(55%_0.006_250)]">
              No devices found.
            </p>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="text-xs font-medium text-[oklch(54%_0.18_250)] hover:underline"
            >
              Add your first device
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[oklch(22%_0.012_250)]">
                  {[
                    "Name",
                    "Status",
                    "IP Address",
                    "RouterOS",
                    "Last seen",
                    "Connection",
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[oklch(50%_0.006_250)]"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.map((device, idx) => (
                  <tr
                    key={device.id}
                    className={`transition hover:bg-[oklch(20%_0.012_250)] ${
                      idx !== devices.length - 1
                        ? "border-b border-[oklch(20%_0.012_250)]"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <a
                        href={`/devices/${device.id}`}
                        className="font-medium text-[oklch(85%_0.006_250)] hover:text-[oklch(65%_0.14_250)] transition-colors"
                      >
                        {device.name}
                      </a>
                      {device.description && (
                        <p className="mt-0.5 truncate text-xs text-[oklch(50%_0.006_250)] max-w-[200px]">
                          {device.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <DeviceStatusBadge
                        status={device.status as DeviceStatus}
                        showPulse
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[oklch(70%_0.006_250)]">
                      {device.ipAddress ?? (
                        <span className="text-[oklch(40%_0.006_250)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[oklch(65%_0.006_250)]">
                      {device.routerOsVersion ?? (
                        <span className="text-[oklch(40%_0.006_250)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[oklch(55%_0.006_250)]">
                      {formatLastSeen(device.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-[oklch(22%_0.012_250)] px-2 py-0.5 text-xs text-[oklch(60%_0.006_250)]">
                        {device.connectionType}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination hint */}
      {!isLoading && devices.length > 0 && (
        <p className="mt-3 text-right text-xs text-[oklch(45%_0.006_250)]">
          Showing {devices.length} device{devices.length !== 1 ? "s" : ""}
          {data?.nextCursor ? " — scroll to load more" : ""}
        </p>
      )}
    </>
  );
}
