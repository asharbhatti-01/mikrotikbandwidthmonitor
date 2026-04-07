"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        }
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(data.message ?? "Invalid email or password.");
      }

      router.push("/devices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-[oklch(92%_0.006_250)]">
        Sign in
      </h1>
      <p className="mb-6 text-sm text-[oklch(60%_0.006_250)]">
        Welcome back — enter your credentials to continue.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-[oklch(55%_0.22_25)/0.3] bg-[oklch(55%_0.22_25)/0.1] px-3 py-2 text-sm text-[oklch(75%_0.16_25)]"
          >
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="text-sm font-medium text-[oklch(80%_0.006_250)]"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] placeholder:text-[oklch(45%_0.006_250)] outline-none transition focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25] disabled:opacity-50"
            disabled={loading}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-sm font-medium text-[oklch(80%_0.006_250)]"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-[oklch(54%_0.18_250)] hover:text-[oklch(65%_0.14_250)] transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] placeholder:text-[oklch(45%_0.006_250)] outline-none transition focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25] disabled:opacity-50"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[oklch(46%_0.19_250)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[oklch(54%_0.18_250)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
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
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[oklch(55%_0.006_250)]">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-[oklch(54%_0.18_250)] hover:text-[oklch(65%_0.14_250)] transition-colors"
        >
          Sign up
        </Link>
      </p>
    </>
  );
}
