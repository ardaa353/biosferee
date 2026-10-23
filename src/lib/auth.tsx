import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import type { CurrentUser } from "./types";

type AuthValue = {
  user: CurrentUser | null; loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: { firstName: string; lastName: string; username: string; email: string; phone: string; password: string; bio: string }) => Promise<void>;
  logout: () => Promise<void>; refresh: () => void;
};
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem("biosfere_session"));
  const me = trpc.biosfere.auth.me.useQuery(undefined, { enabled: Boolean(token), retry: false });
  const loginMutation = trpc.biosfere.auth.login.useMutation();
  const registerMutation = trpc.biosfere.auth.register.useMutation();
  const logoutMutation = trpc.biosfere.auth.logout.useMutation();
  const utils = trpc.useUtils();
  const value = useMemo<AuthValue>(() => ({
    user: token ? me.data ?? null : null, loading: Boolean(token) && me.isLoading,
    login: async (identifier, password) => {
      const result = await loginMutation.mutateAsync({ identifier, password });
      localStorage.setItem("biosfere_session", result.token); setToken(result.token);
      await utils.biosfere.auth.me.invalidate();
    },
    register: async (input) => {
      const result = await registerMutation.mutateAsync(input);
      localStorage.setItem("biosfere_session", result.token); setToken(result.token);
      await utils.biosfere.auth.me.invalidate();
    },
    logout: async () => { try { if (token) await logoutMutation.mutateAsync(); } finally {
      localStorage.removeItem("biosfere_session"); setToken(null); utils.biosfere.invalidate();
    } },
    refresh: () => { utils.biosfere.auth.me.invalidate(); utils.biosfere.users.list.invalidate(); },
  }), [token, me.data, me.isLoading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider missing"); return value; }
