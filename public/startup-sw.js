/* Only the public app shell and fingerprinted assets are cached. API responses and media stay on the network. */
const SHELL_CACHE = "biosfere-startup-shell-v1";
const ASSET_CACHE = "biosfere-startup-assets-v1";
const SHELL_URL = new URL("/", self.location.origin).href;
let refresh;

async function updateShell() {
  if (refresh) return refresh;
  refresh = (async () => {
    const response = await fetch(SHELL_URL, {
      cache: "no-cache",
      signal: AbortSignal.timeout(12000),
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/html")
    )
      throw new Error("App shell unavailable");
    const html = await response.text();
    if (!html.includes("biosfere-startup-word"))
      throw new Error("Waiting for BioSfere");
    const assets = [
      ...new Set(
        [
          ...html.matchAll(
            /(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g,
          ),
        ].map((match) => match[1]),
      ),
    ];
    if (!assets.length) throw new Error("App assets unavailable");
    const assetCache = await caches.open(ASSET_CACHE);
    await Promise.all(
      assets.map(async (path) => {
        if (await assetCache.match(path)) return;
        const asset = await fetch(path);
        if (!asset.ok) throw new Error("App asset unavailable");
        await assetCache.put(path, asset);
      }),
    );
    const shellCache = await caches.open(SHELL_CACHE);
    const previous = await shellCache.match(SHELL_URL);
    const changed = Boolean(previous && (await previous.text()) !== html);
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    headers.set("Cache-Control", "no-cache");
    await shellCache.put(SHELL_URL, new Response(html, { headers }));
    const keys = await assetCache.keys();
    const current = new Set(
      assets.map((path) => new URL(path, self.location.origin).href),
    );
    let remaining = keys.length;
    for (const key of keys) {
      if (remaining <= 40) break;
      if (!current.has(key.url)) {
        await assetCache.delete(key);
        remaining--;
      }
    }
    return { changed };
  })().finally(() => {
    refresh = undefined;
  });
  return refresh;
}
self.addEventListener("install", (event) => {
  event.waitUntil(updateShell().then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "refresh-startup-shell") return;
  event.waitUntil(
    updateShell()
      .then((result) => event.ports[0]?.postMessage(result))
      .catch(() => event.ports[0]?.postMessage({ changed: false })),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (/^\/assets\/[^/]+\.(?:js|css)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          if (keys.length > 40) await cache.delete(keys[0]);
        }
        return response;
      })(),
    );
    return;
  }
  const appRoute =
    /^\/(?:|akis|giris|kayit|paylas|bilinmeyenler|arama|harita|sistematik|ayarlar|admin|yonetim|gonderi\/\d+(?:\/duzenle)?|profil\/[a-z0-9_]+)\/?$/;
  if (request.mode !== "navigate" || !appRoute.test(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const shell = await cache.match(SHELL_URL);
      if (shell) {
        event.waitUntil(updateShell().catch(() => {}));
        return shell;
      }
      return fetch(request);
    })(),
  );
});
