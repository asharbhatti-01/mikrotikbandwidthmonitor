"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MonitorSmartphone,
  Activity,
  Bell,
  Settings,
  LayoutDashboard,
  ChevronRight,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: "Devices", href: "/devices", icon: MonitorSmartphone },
  { label: "Monitoring", href: "/monitoring", icon: Activity },
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-[oklch(22%_0.012_250)] bg-[oklch(14%_0.009_250)]">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-[oklch(22%_0.012_250)] px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[oklch(46%_0.19_250)]">
          <LayoutDashboard className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-[oklch(92%_0.006_250)]">
          MikroTik Manager
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5" role="list">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-[oklch(46%_0.19_250)/0.15] text-[oklch(65%_0.14_250)]"
                      : "text-[oklch(65%_0.006_250)] hover:bg-[oklch(20%_0.012_250)] hover:text-[oklch(85%_0.006_250)]"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      active
                        ? "text-[oklch(54%_0.18_250)]"
                        : "text-[oklch(50%_0.006_250)] group-hover:text-[oklch(70%_0.006_250)]"
                    }`}
                  />
                  {label}
                  {active && (
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-[oklch(54%_0.18_250)]" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer / version */}
      <div className="border-t border-[oklch(22%_0.012_250)] px-5 py-3">
        <p className="text-xs text-[oklch(40%_0.006_250)]">v0.1.0</p>
      </div>
    </aside>
  );
}
