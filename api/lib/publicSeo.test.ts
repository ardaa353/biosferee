import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerPublicSeo } from "./publicSeo";

const state = vi.hoisted(() => ({ rows: [] as unknown[], fail: false, get: vi.fn() }));
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
vi.mock("../biosfereRouter", () => ({ biosfereRouter: { createCaller: () => ({ posts: { get: state.get } }) } }));
vi.mock("./logger", () => ({ log: { error: vi.fn() } }));

function app() {
  const app = new Hono();
  registerPublicSeo(app, '<html><head></head><body><div id="root">App</div></body></html>');
  return app;
}

beforeEach(() => { state.rows = []; state.fail = false; state.get.mockReset(); });

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
