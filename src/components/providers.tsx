"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useState, type ReactNode } from "react";
import { LiveFeedProvider } from "./LiveFeedProvider";

/** One QueryClient per browser session (storefront-data §4). */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // The live feed keeps data fresh.
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <LiveFeedProvider>{children}</LiveFeedProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
