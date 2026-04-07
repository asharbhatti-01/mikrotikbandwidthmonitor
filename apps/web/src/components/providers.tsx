"use client";

import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { trpc, makeQueryClient, makeTRPCClient } from "@/lib/trpc";

/**
 * Wraps the app with both QueryClientProvider and the tRPC React provider.
 * Must be a Client Component because it holds mutable client instances.
 */
export function TRPCProvider({ children }: { children: ReactNode }) {
  // useState ensures a single stable instance per component mount
  const [queryClient] = useState(() => makeQueryClient());
  const [trpcClient] = useState(() => makeTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
