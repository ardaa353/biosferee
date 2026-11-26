import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForServer } from "./startup";

vi.mock("./i18n", () => ({ t: (text: string) => text }));

const origin = "https://biosfere.test";
const shell =
  '<html><span class="biosfere-startup-word">BioSfere</span><script src="/assets/app-1.js"></script><link href="/assets/app-1.css" rel="stylesheet"></html>';
const workerSource = readFileSync(
  new URL("../../public/startup-sw.js", import.meta.url),
  "utf8",
);
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html" } });

function worker() {
  type Event = {
    request: Request;
    data?: { type: string };
    ports: { postMessage: (data: unknown) => void }[];
    respondWith: (response: Promise<Response>) => void;
    waitUntil: (work: Promise<unknown>) => void;
  };
  const listeners = new Map<string, (event: Partial<Event>) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const key = (value: string | Request) =>
    new URL(typeof value === "string" ? value : value.url, origin).href;
  const cacheStorage = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        match: async (value: string | Request) =>
          store.get(key(value))?.clone(),
        put: async (value: string | Request, response: Response) => {
          store.set(key(value), response.clone());
        },
        keys: async () => [...store.keys()].map((value) => new Request(value)),
        delete: async (value: string | Request) => store.delete(key(value)),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const fetch = vi.fn(async (value: string | Request) => {
    if (key(value) === origin + "/index.html") return html(shell);
    return new Response("asset", {
      headers: { "Content-Type": "text/javascript" },
    });
  });
  runInNewContext(workerSource, {
    self: {
      location: { origin },
      addEventListener: (
        type: string,
        listener: (event: Partial<Event>) => void,
      ) => listeners.set(type, listener),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: cacheStorage,
    fetch,
    URL,
    Headers,
    Response,
    AbortSignal,
  });
  return {
    fetch,
    stores,
    async install() {
      const jobs: Promise<unknown>[] = [];
      listeners.get("install")!({
        waitUntil: (job) => jobs.push(job),
      });
      await Promise.all(jobs);
    },
    async activate() {
      const jobs: Promise<unknown>[] = [];
      listeners.get("activate")!({ waitUntil: (job) => jobs.push(job) });
      await Promise.all(jobs);
    },
    request(path: string, mode = "navigate", method = "GET") {
      let response: Promise<Response> | undefined;
      const jobs: Promise<unknown>[] = [];
      listeners.get("fetch")!({
        request: { url: origin + path, mode, method } as Request,
        respondWith: (value) => {
          response = value;
        },
        waitUntil: (job) => jobs.push(job),
      });
      return { response, jobs };
    },
    async refresh() {
      const jobs: Promise<unknown>[] = [];
      const reply = vi.fn();
      listeners.get("message")!({
        data: { type: "refresh-startup-shell" },
        ports: [{ postMessage: reply }],
        waitUntil: (job) => jobs.push(job),
      });
      await Promise.all(jobs);
      return reply.mock.calls[0]?.[0];
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("BioSfere başlangıç önbelleği", () => {
  it("herkese açık ana sayfa, keşif ve gözlem adreslerini eski uygulama kabuğuyla değiştirmez", () => {
    const app = worker();
    for (const path of ["/", "/kesfet", "/explore", "/gonderi/17", "/biosfere.html"]) {
      expect(app.request(path).response).toBeUndefined();
    }
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("yeni kabuğu kararlı index adresinden yükleyip yalnızca eski kabuk önbelleğini temizler", async () => {
    const app = worker();
    app.stores.set("biosfere-startup-shell-v1", new Map());
    app.stores.set("other-app-cache", new Map());
    await app.install();
    expect(app.fetch.mock.calls[0][0]).toBe(origin + "/index.html");
    await app.activate();
    expect(app.stores.has("biosfere-startup-shell-v1")).toBe(false);
    expect(app.stores.has("biosfere-startup-shell-v2")).toBe(true);
    expect(app.stores.has("biosfere-startup-assets-v1")).toBe(true);
    expect(app.stores.has("other-app-cache")).toBe(true);
  });

  it("başlangıç HTML'iyle birlikte çalışması için gereken dosyaları saklar", async () => {
    const app = worker();
    await app.install();
    expect([...app.stores.get("biosfere-startup-assets-v1")!.keys()]).toEqual([
      origin + "/assets/app-1.js",
      origin + "/assets/app-1.css",
    ]);
    expect(
      await app.stores
        .get("biosfere-startup-shell-v2")!
        .get(origin + "/index.html")!
        .text(),
    ).toBe(shell);
  });
  it("sunucu uyanırken Render ekranını kaydetmeden kendi ekranını verir", async () => {
    const app = worker();
    await app.install();
    app.fetch.mockImplementation(async () => html("Render is starting…", 503));
    const event = app.request("/akis");
    expect(await (await event.response)!.text()).toBe(shell);
    await Promise.all(event.jobs);
    expect(
      await app.stores
        .get("biosfere-startup-shell-v2")!
        .get(origin + "/index.html")!
        .clone()
        .text(),
    ).toBe(shell);
  });
  it("API, fotoğraf, video, dışa aktarma ve yazma isteklerini önbelleğe almaz", () => {
    const app = worker();
    for (const path of [
      "/api/health",
      "/api/trpc/biosfere.auth.me",
      "/uploads/photo.jpg",
      "/uploads/video.mp4",
      "/archive.zip",
    ]) {
      expect(app.request(path).response).toBeUndefined();
    }
    expect(app.request("/giris", "navigate", "POST").response).toBeUndefined();
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("200 dönen sağlayıcı ekranını da uygulama olarak kabul etmez", async () => {
    const app = worker();
    app.fetch.mockImplementation(async () => html("Render is starting…"));
    await expect(app.install()).rejects.toThrow("Waiting for BioSfere");
    expect(app.stores.get("biosfere-startup-shell-v2")).toBeUndefined();
  });
  it("yeni sürümün dosyaları alınamazsa çalışan önceki sürümü korur", async () => {
    const app = worker();
    await app.install();
    app.fetch.mockImplementation(async (value) =>
      new URL(typeof value === "string" ? value : value.url, origin)
        .pathname === "/index.html"
        ? html(shell.replaceAll("app-1", "app-2"))
        : new Response("missing", { status: 404 }),
    );
    expect(await app.refresh()).toEqual({ changed: false });
    expect(
      await app.stores
        .get("biosfere-startup-shell-v2")!
        .get(origin + "/index.html")!
        .clone()
        .text(),
    ).toBe(shell);
  });
  it("yeni sürümü algılar ve aynı sürüm için tekrar yenileme istemez", async () => {
    const app = worker();
    await app.install();
    app.fetch.mockImplementation(async (value) =>
      new URL(typeof value === "string" ? value : value.url, origin)
        .pathname === "/index.html"
        ? html(shell.replaceAll("app-1", "app-2"))
        : new Response("new asset"),
    );
    expect(await app.refresh()).toEqual({ changed: true });
    expect(await app.refresh()).toEqual({ changed: false });
  });
});

describe("Sunucunun hazır olması", () => {
  it("Render HTML'i geldiğinde bekler, sağlık yanıtından sonra açar", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(html("Render is starting…"))
      .mockResolvedValueOnce(Response.json({ status: "ok" }));
    vi.stubGlobal("fetch", fetch);
    const ready = waitForServer(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(2000);
    await ready;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe("/api/health");
  });
  it("ekran kapatıldığında beklemeyi ve yeni istekleri durdurur", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(html("Render is starting…", 503));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const done = waitForServer(controller.signal).catch((error) => error);
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    expect((await done).name).toBe("AbortError");
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
