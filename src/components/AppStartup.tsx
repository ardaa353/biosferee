import { useEffect, useState, type ReactNode } from "react";
import { refreshStartupShell, waitForServer } from "@/lib/startup";
import StartupScreen from "./StartupScreen";

export default function AppStartup({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"waiting" | "ready" | "failed">(() =>
    "serviceWorker" in navigator && navigator.serviceWorker.controller
      ? "waiting"
      : "ready",
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (state !== "waiting") return;
    const controller = new AbortController();
    void (async () => {
      try {
        await waitForServer(controller.signal);
        const updated = await refreshStartupShell();
        if (controller.signal.aborted) return;
        if (updated) {
          window.location.reload();
          return;
        }
        setState("ready");
      } catch {
        if (!controller.signal.aborted) setState("failed");
      }
    })();
    return () => controller.abort();
  }, [state, attempt]);
  if (state === "ready") return children;
  return (
    <StartupScreen
      failed={state === "failed"}
      retry={() => {
        setState("waiting");
        setAttempt((value) => value + 1);
      }}
    />
  );
}
