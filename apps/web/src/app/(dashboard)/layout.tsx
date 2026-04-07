"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, Building2, LogOut, User } from "lucide-react";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  async function handleLogout() {
    await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/auth/logout`,
      { method: "POST", credentials: "include" }
    );
    router.push("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[oklch(12%_0.008_250)]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[oklch(22%_0.012_250)] bg-[oklch(14%_0.009_250)] px-6">
          {/* Org switcher placeholder */}
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(18%_0.011_250)] px-3 py-1.5 text-sm text-[oklch(80%_0.006_250)] transition hover:bg-[oklch(22%_0.012_250)]"
          >
            <Building2 className="h-3.5 w-3.5 text-[oklch(54%_0.18_250)]" />
            <span>My Organisation</span>
            <ChevronDown className="h-3.5 w-3.5 text-[oklch(50%_0.006_250)]" />
          </button>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {/* Notification bell */}
            <Link
              href="/alerts"
              aria-label="View alerts"
              className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[oklch(60%_0.006_250)] transition hover:bg-[oklch(22%_0.012_250)] hover:text-[oklch(85%_0.006_250)]"
            >
              <Bell className="h-4 w-4" />
            </Link>

            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[oklch(75%_0.006_250)] transition hover:bg-[oklch(22%_0.012_250)]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[oklch(46%_0.19_250)/0.3] text-xs font-semibold text-[oklch(65%_0.14_250)]">
                  U
                </span>
                <span className="hidden sm:inline">Account</span>
                <ChevronDown className="h-3.5 w-3.5 text-[oklch(50%_0.006_250)]" />
              </button>

              {userMenuOpen && (
                <>
                  {/* Click-outside overlay */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setUserMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-[oklch(25%_0.013_250)] bg-[oklch(18%_0.011_250)] py-1 shadow-xl"
                  >
                    <Link
                      href="/settings"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-[oklch(75%_0.006_250)] transition hover:bg-[oklch(22%_0.012_250)] hover:text-[oklch(90%_0.006_250)]"
                    >
                      <User className="h-3.5 w-3.5" />
                      Profile
                    </Link>
                    <div className="my-1 h-px bg-[oklch(22%_0.012_250)]" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[oklch(70%_0.16_25)] transition hover:bg-[oklch(55%_0.22_25)/0.1]"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
