import { setAccountLanguage } from "./i18n";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { trpc, queryClient } from "@/providers/trpc";
import type { CurrentUser } from "./types";

type AuthValue = {
  user: CurrentUser | null; loading: boolean; error: boolean;
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
  useEffect(() => {
    if (!token) setAccountLanguage(null);
    else if (me.data) setAccountLanguage(me.data.language);
  }, [token, me.data?.language]);
  useEffect(() => {
    if (token && me.isSuccess && me.data === null) {
      localStorage.removeItem("biosfere_session"); setToken(null); queryClient.clear();
    }
  }, [token, me.isSuccess, me.data]);
  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key !== "biosfere_session") return;
      void queryClient.cancelQueries().then(() => {queryClient.clear(); setToken(event.newValue);});
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);
  const value = useMemo<AuthValue>(() => ({
    user: token ? me.data ?? null : null, loading: Boolean(token) && me.isLoading, error: Boolean(token) && me.isError,
    login: async (identifier, password) => {
      const result = await loginMutation.mutateAsync({ identifier, password });
      await queryClient.cancelQueries(); queryClient.clear();
      localStorage.setItem("biosfere_session", result.token);
      utils.biosfere.auth.me.setData(undefined, result.user); setToken(result.token); setAccountLanguage(result.user.language);
    },
    register: async (input) => {
      const result = await registerMutation.mutateAsync(input);
      await queryClient.cancelQueries(); queryClient.clear();
      localStorage.setItem("biosfere_session", result.token);
      utils.biosfere.auth.me.setData(undefined, result.user); setToken(result.token); setAccountLanguage(result.user.language);
    },
    logout: async () => { try { if (token) await logoutMutation.mutateAsync(); } finally {
      localStorage.removeItem("biosfere_session"); setToken(null);
      await queryClient.cancelQueries(); queryClient.clear();
    } },
    refresh: () => { utils.biosfere.auth.me.invalidate(); utils.biosfere.users.list.invalidate(); },
  }), [token, me.data, me.isLoading, me.isError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider missing"); return value; }
