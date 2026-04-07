import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "@mikrotik/api/src/trpc";

/**
 * tRPC React hooks bound to the API's AppRouter type.
 * Import `trpc` from this module throughout the app.
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Shared QueryClient factory — called once per provider mount.
 * Keeping staleTime at 30 s reduces redundant refetches on tab focus.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // Don't retry on 4xx errors (tRPC TRPCClientError carries .data.httpStatus)
          const httpStatus = (
            error as { data?: { httpStatus?: number } } | null
          )?.data?.httpStatus;
          if (typeof httpStatus === "number" && httpStatus < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}

/**
 * Build the tRPC client — reads the API base URL from the env var.
 * Falls back to localhost for local development.
 */
export function makeTRPCClient() {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
        // tRPC v11 passes the transformer at the link level via headers/serialize
        // but superjson is handled through the transformer option on the link.
        transformer: superjson,
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        },
      }),
    ],
  });
}
