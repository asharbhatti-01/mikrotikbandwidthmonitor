"use client";

import { Activity, Wifi, WifiOff, AlertTriangle, Ban } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DeviceStatusBadge } from "@/components/device-status-badge";
import type { DeviceStatus } from "@mikrotik/types";

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  iconColor: string;
  bgColor: string;
}

function StatCard({ icon: Icon, label, value, iconColor, bgColor }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[oklch(22%_0.012_250)] bg-[oklch(16%_0.01_250)] p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bgColor}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-[oklch(92%_0.006_250)]">{value}</p>
        <p className="text-xs text-[oklch(55%_0.006_250)]">{label}</p>
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  const { data: onlineData } = trpc.devices.list.useQuery({
    status: "online",
    limit: 100,
  });
  const { data: offlineData } = trpc.devices.list.useQuery({
    status: "offline",
    limit: 100,
  });
  const { data: warningData } = trpc.devices.list.useQuery({
    status: "warning",
    limit: 100,
  });
  const { data: unreachableData } = trpc.devices.list.useQuery({
    status: "unreachable",
    limit: 100,
  });
  const { data: allData, isLoading } = trpc.devices.list.useQuery({
    limit: 20,
  });

  const counts = {
    online: onlineData?.items.length ?? 0,
    offline: offlineData?.items.length ?? 0,
    warning: warningData?.items.length ?? 0,
    unreachable: unreachableData?.items.length ?? 0,
  };

  const total = counts.online + counts.offline + counts.warning + counts.unreachable;
  const healthPct = total > 0 ? Math.round((counts.online / total) * 100) : 0;

  const recentDevices = allData?.items ?? [];

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[oklch(92%_0.006_250)]">
          Monitoring
        </h1>
        <p className="mt-0.5 text-sm text-[oklch(55%_0.006_250)]">
          Fleet health summary and real-time status.
        </p>
      </div>

      {/* Health score */}
      <div className="mb-6 flex items-center gap-6 rounded-xl border border-[oklch(22%_0.012_250)] bg-[oklch(16%_0.01_250)] p-6">
        {/* Circular progress placeholder */}
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
          <svg
            className="absolute inset-0 -rotate-90"
            viewBox="0 0 80 80"
            aria-hidden="true"
          >
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="oklch(22% 0.012 250)"
              strokeWidth="8"
            />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="oklch(64% 0.18 145)"
              strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - healthPct / 100)}`}
              strokeLinecap="round"
            />
          </svg>
          <span className="relative text-lg font-bold text-[oklch(88%_0.006_250)]">
            {healthPct}%
          </span>
        </div>
        <div>
          <p className="text-base font-semibold text-[oklch(88%_0.006_250)]">
            Fleet health
          </p>
          <p className="mt-0.5 text-sm text-[oklch(55%_0.006_250)]">
            {counts.online} of {total} devices are online.
          </p>
        </div>
      </div>

      {/* Status breakdown cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Wifi}
          label="Online"
          value={counts.online}
          iconColor="text-[oklch(64%_0.18_145)]"
          bgColor="bg-[oklch(64%_0.18_145)/0.12]"
        />
        <StatCard
          icon={WifiOff}
          label="Offline"
          value={counts.offline}
          iconColor="text-[oklch(55%_0.22_25)]"
          bgColor="bg-[oklch(55%_0.22_25)/0.12]"
        />
        <StatCard
          icon={AlertTriangle}
          label="Warning"
          value={counts.warning}
          iconColor="text-[oklch(78%_0.18_75)]"
          bgColor="bg-[oklch(78%_0.18_75)/0.12]"
        />
        <StatCard
          icon={Ban}
          label="Unreachable"
          value={counts.unreachable}
          iconColor="text-[oklch(50%_0.01_250)]"
          bgColor="bg-[oklch(50%_0.01_250)/0.12]"
        />
      </div>

      {/* Recent devices table */}
      <div className="rounded-xl border border-[oklch(22%_0.012_250)] bg-[oklch(16%_0.01_250)]">
        <div className="border-b border-[oklch(22%_0.012_250)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[oklch(54%_0.18_250)]" />
            <h2 className="text-sm font-semibold text-[oklch(80%_0.006_250)]">
              Recent devices
            </h2>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <svg
              className="h-5 w-5 animate-spin text-[oklch(54%_0.18_250)]"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-label="Loading"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <ul className="divide-y divide-[oklch(20%_0.012_250)]">
            {recentDevices.map((device) => (
              <li
                key={device.id}
                className="flex items-center justify-between px-5 py-3 transition hover:bg-[oklch(18%_0.011_250)]"
              >
                <div className="flex flex-col gap-0.5">
                  <a
                    href={`/devices/${device.id}`}
                    className="text-sm font-medium text-[oklch(85%_0.006_250)] hover:text-[oklch(65%_0.14_250)] transition-colors"
                  >
                    {device.name}
                  </a>
                  <span className="font-mono text-xs text-[oklch(50%_0.006_250)]">
                    {device.ipAddress ?? "No IP"}
                  </span>
                </div>
                <DeviceStatusBadge
                  status={device.status as DeviceStatus}
                  showPulse
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
