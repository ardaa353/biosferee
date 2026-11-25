import type { Context, Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { asc, ne, sql } from "drizzle-orm";
import { posts } from "../../db/schema";
import { getDb } from "../queries/connection";
import { biosfereRouter, getPublicObservationPage } from "../biosfereRouter";
import { discoveryDocument, observationsRss, parseDiscoveryQuery, type DiscoveryLanguage } from "./discovery";
import { observationDocument, SITE_URL, sitemapIndexXml, sitemapXml, SITEMAP_PAGE_SIZE } from "./seo";
import { log } from "./logger";

export function registerPublicSeo(app: Hono<{ Bindings: HttpBindings }>, index: string) {
  app.get("/", c => {
    c.header("Cache-Control", "no-store");
    c.header("Vary", "Accept-Language");
    const language = c.req.header("Accept-Language")?.split(",")[0]?.split(";")[0]?.trim().toLowerCase();
    return c.redirect(language && !language.startsWith("tr") ? "/explore" : "/kesfet", 302);
  });
  const discovery = async (c: Context<{ Bindings: HttpBindings }>, language: DiscoveryLanguage) => {
    c.header("Cache-Control", "private, no-store");
    const query = parseDiscoveryQuery(c.req.query("page"), c.req.query("kingdom"));
    if (!query) {
      c.header("X-Robots-Tag", "noindex");
      return c.text(language === "tr" ? "Geçersiz sayfa veya filtre." : "Invalid page or filter.", 400);
    }
    try {
      const data = await getPublicObservationPage(query);
      if (query.page > 1 && !data.items.length) {
        c.header("X-Robots-Tag", "noindex");
        return c.text(language === "tr" ? "Gözlem sayfası bulunamadı." : "Observation page not found.", 404);
      }
      return c.html(discoveryDocument(data, language, query));
    } catch {
      c.header("Retry-After", "60");
      c.header("X-Robots-Tag", "noindex");
      return c.text(language === "tr" ? "Gözlemler şu anda yüklenemedi. Lütfen yeniden deneyin." : "Observations are temporarily unavailable. Please try again.", 503);
    }
  };
  app.get("/kesfet", c => discovery(c, "tr"));
  app.get("/explore", c => discovery(c, "en"));
  app.get("/gozlemler.rss", async c => {
    c.header("Cache-Control", "private, no-store");
    try {
      const data = await getPublicObservationPage({ page: 1 });
      c.header("Content-Type", "application/rss+xml; charset=utf-8");
      return c.body(observationsRss(data.items));
    } catch {
      c.header("Retry-After", "60");
      c.header("X-Robots-Tag", "noindex");
      return c.text("Observation feed temporarily unavailable.", 503);
    }
  });
  app.get("/rss.xml", c => c.redirect("/gozlemler.rss", 302));

  app.get("/sitemap.xml", async c => {
    try {
      const [row] = await getDb().select({ count: sql<number>`count(*)` }).from(posts).where(ne(posts.status, "removed"));
      c.header("Content-Type", "application/xml; charset=utf-8");
      c.header("Cache-Control", "public, max-age=60");
      return c.body(sitemapIndexXml(Number(row.count)));
    } catch {
      c.header("Retry-After", "60");
      return c.text("Site haritası geçici olarak hazırlanamadı.", 503);
    }
  });
  app.get("/sitemaps/pages.xml", c => {
    c.header("Content-Type", "application/xml; charset=utf-8");
    return c.body(sitemapXml([{ url: `${SITE_URL}/biosfere.html` }, { url: `${SITE_URL}/biosfere-en.html` }, { url: `${SITE_URL}/kesfet` }, { url: `${SITE_URL}/explore` }]));
  });
  app.get("/sitemaps/:filename", async c => {
    const match = /^posts-([1-9]\d*)\.xml$/.exec(c.req.param("filename"));
    const page = match ? Number(match[1]) : 0;
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return c.notFound();
    try {
      const entries = await getDb().select({ id: posts.id, updatedAt: posts.updatedAt }).from(posts)
        .where(ne(posts.status, "removed")).orderBy(asc(posts.id))
        .limit(SITEMAP_PAGE_SIZE).offset((page - 1) * SITEMAP_PAGE_SIZE);
      if (!entries.length) return c.text("Site haritası bulunamadı.", 404);
      c.header("Content-Type", "application/xml; charset=utf-8");
      c.header("Cache-Control", "public, max-age=60");
      return c.body(sitemapXml(entries.map(post => ({ url: `${SITE_URL}/gonderi/${post.id}`, updatedAt: post.updatedAt }))));
    } catch {
      c.header("Retry-After", "60");
      return c.text("Site haritası geçici olarak hazırlanamadı.", 503);
    }
  });
  app.get("/gonderi/:id", async c => {
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id) || id < 1) {
      c.header("X-Robots-Tag", "noindex");
      return c.html(index, 404);
    }
    try {
      // Mevcut herkese açık get yordamı aynı görünürlük kurallarını uygular.
      const caller = biosfereRouter.createCaller({ req: c.req.raw, resHeaders: new Headers() });
      const post = await caller.posts.get({ id });
      c.header("Cache-Control", "private, no-store");
      return c.html(observationDocument(index, post));
    } catch (error) {
      const notFound = error instanceof Error && "code" in error && error.code === "NOT_FOUND";
      c.header("X-Robots-Tag", "noindex");
      if (notFound) return c.html(index, 404);
      log.error("public observation rendering failed", { postId: id });
      c.header("Retry-After", "60");
      return c.html(index, 503);
    }
  });
}
