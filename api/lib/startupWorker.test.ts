import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../public/startup-sw.js", import.meta.url), "utf8");
const origin = "https://biosferee.onrender.com";
const shell = '<html><span id="biosfere-startup-word"></span><script src="/assets/app.hash.js"></script></html>';
function setup(cached = true) {
  const handlers = new Map<string, (event: any) => void>();
  const put = vi.fn(async () => {});
  const match = vi.fn(async (key: string) => cached && (key === origin + "/index.html" || key === "/assets/app.hash.js") ? new Response(shell, { headers: { "Content-Type": "text/html" } }) : undefined);
  const cache = { match, put, keys: vi.fn(async () => []), delete: vi.fn(async () => true) };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ["biosfere-startup-shell-v1", "biosfere-startup-shell-v2", "biosfere-startup-assets-v1", "other-app-cache"]), delete: vi.fn(async () => true) };
  const fetch = vi.fn(async (url: string) => new Response(url.endsWith("/index.html") ? shell : "console.log('app')", { headers: { "Content-Type": url.endsWith("/index.html") ? "text/html" : "application/javascript" } }));
  const self = { location: { origin }, addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler), skipWaiting: vi.fn(), clients: { claim: vi.fn(async () => {}) } };
  runInNewContext(source, { self, caches, fetch, URL, Headers, Response, AbortSignal });
  return { handlers, caches, cache, fetch, self };
}
describe("public discovery and startup worker compatibility", () => {
  it("lets public homepage, discovery and observation navigation reach the server", () => {
    const { handlers, fetch, caches } = setup();
    for (const path of ["/", "/kesfet", "/explore", "/gonderi/7", "/biosfere.html"]) {
      const respondWith = vi.fn();
      handlers.get("fetch")!({ request: { method: "GET", mode: "navigate", url: origin + path }, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(caches.open).not.toHaveBeenCalled();
  });
  it.each(["/akis", "/giris", "/gonderi/7/duzenle"])("keeps the application shell available for %s", async path => {
    const { handlers, fetch, cache } = setup();
    const work: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: { method: "GET", mode: "navigate", url: origin + path },
      respondWith: (promise: Promise<Response>) => { response = promise; },
      waitUntil: (promise: Promise<unknown>) => work.push(promise),
    });
    expect(await (await response!).text()).toBe(shell);
    await Promise.all(work);
    expect(cache.match).toHaveBeenCalledWith(origin + "/index.html");
    expect(fetch.mock.calls[0][0]).toBe(origin + "/index.html");
  });
  it("installs from the stable application document instead of the public homepage redirect", async () => {
    const { handlers, fetch, self, cache } = setup(false);
    let work: Promise<unknown> | undefined;
    handlers.get("install")!({ waitUntil: (promise: Promise<unknown>) => { work = promise; } });
    await work;
    expect(fetch.mock.calls[0][0]).toBe(origin + "/index.html");
    expect(cache.put).toHaveBeenCalledWith(origin + "/index.html", expect.any(Response));
    expect(self.skipWaiting).toHaveBeenCalledOnce();
  });
  it("replaces only obsolete shell caches while preserving assets and unrelated caches", async () => {
    const { handlers, caches, self } = setup();
    let work: Promise<unknown> | undefined;
    handlers.get("activate")!({ waitUntil: (promise: Promise<unknown>) => { work = promise; } });
    await work;
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith("biosfere-startup-shell-v1");
    expect(self.clients.claim).toHaveBeenCalledOnce();
  });
});
