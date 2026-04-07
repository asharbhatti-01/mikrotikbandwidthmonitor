import type { DeviceStatus } from "@mikrotik/types";

interface DeviceStatusBadgeProps {
  status: DeviceStatus;
  /** Optionally show a pulsing dot for online status */
  showPulse?: boolean;
}

const statusConfig: Record<
  DeviceStatus,
  { label: string; dot: string; pill: string }
> = {
  online: {
    label: "Online",
    dot: "bg-[oklch(64%_0.18_145)]",
    pill: "bg-[oklch(64%_0.18_145)/0.15] text-[oklch(72%_0.18_145)] border-[oklch(64%_0.18_145)/0.3]",
  },
  offline: {
    label: "Offline",
    dot: "bg-[oklch(55%_0.22_25)]",
    pill: "bg-[oklch(55%_0.22_25)/0.15] text-[oklch(70%_0.16_25)] border-[oklch(55%_0.22_25)/0.3]",
  },
  warning: {
    label: "Warning",
    dot: "bg-[oklch(78%_0.18_75)]",
    pill: "bg-[oklch(78%_0.18_75)/0.15] text-[oklch(82%_0.16_75)] border-[oklch(78%_0.18_75)/0.3]",
  },
  unreachable: {
    label: "Unreachable",
    dot: "bg-[oklch(50%_0.01_250)]",
    pill: "bg-[oklch(50%_0.01_250)/0.15] text-[oklch(65%_0.006_250)] border-[oklch(50%_0.01_250)/0.3]",
  },
};

export function DeviceStatusBadge({
  status,
  showPulse = false,
}: DeviceStatusBadgeProps) {
  const cfg = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.pill}`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {showPulse && status === "online" && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.dot} opacity-75`}
          />
        )}
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${cfg.dot}`}
        />
      </span>
      {cfg.label}
    </span>
  );
}
