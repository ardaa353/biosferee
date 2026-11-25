import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerPublicSeo } from "./publicSeo";

const state = vi.hoisted(() => ({ rows: [] as unknown[], fail: false, get: vi.fn(), discover: vi.fn() }));
vi.mock("../queries/connection", () => ({
  getDb: () => {
    if (state.fail) throw new Error("offline");
    const query = {
      from: () => query, where: () => query, orderBy: () => query,
      limit: () => query, offset: () => query,
      then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(state.rows).then(resolve, reject),
    };
    return { select: () => query };
  },
}));
vi.mock("../biosfereRouter", () => ({ biosfereRouter: { createCaller: () => ({ posts: { get: state.get } }) }, getPublicObservationPage: state.discover }));
vi.mock("./logger", () => ({ log: { error: vi.fn() } }));

function app() {
  const app = new Hono();
  registerPublicSeo(app, '<html><head></head><body><div id="root">App</div></body></html>');
  return app;
}

beforeEach(() => { state.rows = []; state.fail = false; state.get.mockReset(); state.discover.mockReset(); state.discover.mockResolvedValue({ items: [], nextPage: null }); });

describe("public SEO routes", () => {
  it("serves the static sitemap without a database connection", async () => {
    state.fail = true;
    const response = await app().request("/sitemaps/pages.xml");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("biosfere.html");
  });
  it("includes all observation sitemap pages in the index", async () => {
    state.rows = [{ count: 10001 }];
    const response = await app().request("/sitemap.xml");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("posts-2.xml");
  });
  it("matches real observation sitemap URLs", async () => {
    state.rows = [{ id: 7, updatedAt: new Date("2026-11-24T10:00:00Z") }];
    const response = await app().request("/sitemaps/posts-1.xml");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(await response.text()).toContain("/gonderi/7");
  });
  it("returns 404 for invalid and empty sitemap pages", async () => {
    for (const path of ["/sitemaps/posts-0.xml", "/sitemaps/posts-abc.xml", "/sitemaps/posts-1.xml"]) {
      expect((await app().request(path)).status).toBe(404);
    }
  });
  it("returns 503 during database failures", async () => {
    state.fail = true;
    const response = await app().request("/sitemap.xml");
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
  });
  it("returns 404 and noindex for removed observations", async () => {
    state.get.mockRejectedValue(Object.assign(new Error("removed"), { code: "NOT_FOUND" }));
    const response = await app().request("/gonderi/7");
    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });
  it("uses the existing anonymous public post query", async () => {
    state.get.mockResolvedValue({ id: 7, description: "Gözlem", city: "Giresun", status: "unknown",
      createdAt: new Date(), updatedAt: new Date(), images: [], author: { firstName: "Arda", lastName: "Köse" } });
    const response = await app().request("/gonderi/7");
    expect(response.status).toBe(200);
    expect(state.get).toHaveBeenCalledWith({ id: 7 });
    expect(await response.text()).toContain("Tanımlanmamış canlı");
  });
});

describe("public visitor discovery and RSS routes", () => {
  const observation = { id: 7, commonName: "Elma", species: "Malus baccata", kingdom: "Plantae",
    description: "Gözlem", city: "Erzincan", status: "verified",
    createdAt: new Date("2026-11-23T10:00:00Z"), updatedAt: new Date("2026-11-24T10:00:00Z"), images: [] };
  it("takes new homepage visitors to public discovery without requiring authentication", async () => {
    const response = await app().request("/", { headers: { "Accept-Language": "en-GB,en;q=0.9" } });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/explore");
    expect(response.headers.get("vary")).toBe("Accept-Language");
    expect(state.discover).not.toHaveBeenCalled();
    const turkish = await app().request("/", { headers: { "Accept-Language": "tr-TR,tr;q=0.9" } });
    expect(turkish.headers.get("location")).toBe("/kesfet");
  });
  it("renders an anonymous filtered page with bounded query parameters", async () => {
    state.discover.mockResolvedValue({ items: [observation], nextPage: 3 });
    const response = await app().request("/kesfet?kingdom=Plantae&page=2");
    expect(response.status).toBe(200);
    expect(state.discover).toHaveBeenCalledWith({ page: 2, kingdom: "Plantae" });
    expect(await response.text()).toContain('href="/gonderi/7"');
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects invalid pagination and filters before querying observations", async () => {
    for (const path of ["/kesfet?page=0", "/explore?page=1001", "/kesfet?kingdom=Alien"]) {
      expect((await app().request(path)).status).toBe(400);
    }
    expect(state.discover).not.toHaveBeenCalled();
  });
  it("distinguishes an empty first page from a missing paginated page", async () => {
    expect((await app().request("/kesfet")).status).toBe(200);
    expect((await app().request("/kesfet?page=2")).status).toBe(404);
  });
  it("renders the English discovery page", async () => {
    const response = await app().request("/explore");
    expect(await response.text()).toContain("Explore nature observations");
  });
  it("returns a retryable error rather than pretending a database outage is an empty collection", async () => {
    state.discover.mockRejectedValue(new Error("database secret"));
    for (const path of ["/kesfet", "/explore", "/gozlemler.rss"]) {
      const response = await app().request(path);
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("60");
      expect(response.headers.get("x-robots-tag")).toBe("noindex");
      expect(await response.text()).not.toContain("database secret");
    }
  });
  it("serves an anonymous RSS feed and its conventional alias", async () => {
    state.discover.mockResolvedValue({ items: [observation], nextPage: null });
    const response = await app().request("/gozlemler.rss");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    expect(await response.text()).toContain("https://biosferee.onrender.com/gonderi/7");
    expect((await app().request("/rss.xml")).headers.get("location")).toBe("/gozlemler.rss");
  });
  it("includes both discovery languages in the static sitemap during a database outage", async () => {
    state.fail = true;
    const response = await app().request("/sitemaps/pages.xml");
    const xml = await response.text();
    expect(response.status).toBe(200);
    expect(xml).toContain("https://biosferee.onrender.com/kesfet");
    expect(xml).toContain("https://biosferee.onrender.com/explore");
  });
});
