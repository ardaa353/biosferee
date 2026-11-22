import { t as trText } from "@/lib/i18n";
export function installStartupCache() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const install = () => {
    void navigator.serviceWorker
      .register("/startup-sw.js", { updateViaCache: "none" })
      .catch(() => {
        // Browsing remains available if private mode or storage restrictions disable the cache.
      });
  };
  if (document.readyState === "complete") install();
  else window.addEventListener("load", install, { once: true });
}
export async function refreshStartupShell(): Promise<boolean> {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return false;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(false);
    }, 4000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data?.changed === true);
    };
    worker.postMessage({ type: "refresh-startup-shell" }, [channel.port2]);
  });
}
export async function waitForServer(signal: AbortSignal) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(9000)]),
      });
      if (
        response.ok &&
        response.headers.get("content-type")?.includes("application/json")
      ) {
        const body = await response.json();
        if (body.status === "ok") return;
      }
    } catch {
      signal.throwIfAborted();
    }
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal.removeEventListener("abort", stop);
        resolve();
      };
      const timer = setTimeout(finish, 2000);
      const stop = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) stop();
    });
  }
  throw new Error(trText("Sunucuya ulaşılamadı."));
}
