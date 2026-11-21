import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../api/router";
import type { ReactNode } from "react";

export const trpc = createTRPCReact<AppRouter>();

export const queryClient = new QueryClient({defaultOptions: {queries: {
  staleTime: 45_000,
  refetchOnWindowFocus: false,
  retry: (attempt, error) => attempt < 1 && !(error instanceof TRPCClientError && ["UNAUTHORIZED", "FORBIDDEN", "BAD_REQUEST", "NOT_FOUND"].includes(error.data?.code)),
}}});
const transport = {
  url: "/api/trpc", transformer: superjson,
  headers() {
    const token = localStorage.getItem("biosfere_session");
    return token ? {authorization: `Bearer ${token}`} : {};
  },
  fetch(input: RequestInfo | URL, init?: RequestInit) {
    return globalThis.fetch(input, {...init, credentials: "include"});
  },
};
const trpcClient = trpc.createClient({
  links: [
    splitLink({condition: operation => operation.path === "biosfere.taxonProfiles",
      true: httpLink(transport), false: httpBatchLink({...transport, maxURLLength: 6000, maxItems: 8})}),
  ],
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
