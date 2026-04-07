import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authentication",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[oklch(12%_0.008_250)] px-4">
      {/* Logo / brand mark */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[oklch(46%_0.19_250)] text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <rect width="20" height="14" x="2" y="3" rx="2" />
            <line x1="8" x2="16" y1="21" y2="21" />
            <line x1="12" x2="12" y1="17" y2="21" />
          </svg>
        </div>
        <span className="text-lg font-semibold tracking-tight text-[oklch(92%_0.006_250)]">
          MikroTik Manager
        </span>
      </div>

      {/* Card container */}
      <div className="w-full max-w-sm rounded-2xl border border-[oklch(25%_0.013_250)] bg-[oklch(16%_0.01_250)] p-8 shadow-2xl">
        {children}
      </div>

      <p className="mt-6 text-center text-xs text-[oklch(55%_0.006_250)]">
        &copy; {new Date().getFullYear()} MikroTik Manager. All rights reserved.
      </p>
    </div>
  );
}
