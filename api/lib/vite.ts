import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function serveStaticFiles(app: Hono<{ Bindings: HttpBindings }>) {
  const index = readFileSync(resolve("dist/public/index.html"), "utf8");
  app.use("/assets/*", async (c, next) => { await next(); if (c.res.ok) c.header("Cache-Control", "public, max-age=31536000, immutable"); });
  app.use("/identification/assets/*", async (c, next) => { await next(); if (c.res.ok) c.header("Cache-Control", c.req.path.endsWith("/worker.js") ? "no-cache" : "public, max-age=31536000, immutable"); });
  app.use("*", serveStatic({ root: "./dist/public" }));
  app.notFound(c => {
    if (!c.req.header("accept")?.includes("text/html") || c.req.path.startsWith("/assets/")) return c.json({ error: "Not Found" }, 404);
    c.header("Cache-Control", "no-cache");
    return c.html(index);
  });
}
