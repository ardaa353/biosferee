import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { escapeHtml, jsonLd, observationDocument, sitemapIndexXml, sitemapXml } from "./seo";

const index = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const post = {
  id: 7, commonName: "Papatya", species: "Bellis perennis", city: "Giresun",
  description: "Sahada gözlenen papatya.", status: "verified",
  createdAt: "2026-11-20T10:00:00Z", updatedAt: "2026-11-24T10:00:00Z",
  images: [{ url: "https://res.cloudinary.com/example/image/upload/papatya.jpg" }],
  author: { firstName: "Arda", lastName: "Köse" },
};

describe("public observation SEO", () => {
  it("renders content and page-specific metadata before JavaScript runs", () => {
    const html = observationDocument(index, post);
    expect(html).toContain("<h1>Papatya</h1>");
    expect(html).toContain("Papatya · Giresun gözlemi — BioSfere</title>");
    expect(html).toContain('rel="canonical" href="https://biosferee.onrender.com/gonderi/7"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('"dateModified":"2026-11-24T10:00:00.000Z"');
    expect(html).toContain('src="/src/main.tsx"');
    expect(html).not.toContain("BioSfere açılıyor…");
    expect(html).not.toContain("biosfere_locale_current");
    expect(html).not.toContain('document.querySelector(".biosfere-startup-label")');
  });
  it("escapes user content in HTML and JSON-LD", () => {
    const html = observationDocument(index, { ...post, description: '</script><script>alert("x")</script>' });
    expect(html).not.toContain('</script><script>alert("x")');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("\\u003c/script>");
  });
  it("omits unsupported image schemes", () => {
    const html = observationDocument(index, { ...post, images: [{ url: "javascript:alert(1)" }] });
    expect(html).not.toContain("javascript:alert");
    expect(html).toContain('name="twitter:card" content="summary"');
  });
  it("labels unidentified observations without inventing a species", () => {
    expect(observationDocument(index, { ...post, commonName: null, species: null })).toContain("<h1>Tanımlanmamış canlı</h1>");
  });
  it("preserves app boot and verification tags", () => {
    const html = observationDocument(index, post);
    expect(html).toContain("google-site-verification");
    expect(html).toContain("msvalidate.01");
    expect(html).toContain('type="module"');
  });
  it("works with minified inline startup code", () => {
    const minified = index.replaceAll("(() => {", "(()=>{");
    expect(observationDocument(minified, post)).not.toContain("biosfere_locale_current");
  });
});

describe("sitemaps", () => {
  it("creates a static map even when the database has zero observations", () => {
    expect(sitemapIndexXml(0)).toContain("/sitemaps/pages.xml");
    expect(sitemapIndexXml(0)).not.toContain("posts-1");
  });
  it("splits observation maps at ten thousand entries", () => {
    expect(sitemapIndexXml(10001)).toContain("posts-2.xml");
    expect(sitemapIndexXml(10000)).not.toContain("posts-2.xml");
  });
  it("uses real modification timestamps and escapes XML", () => {
    const xml = sitemapXml([{ url: "https://example.test/a&b", updatedAt: post.updatedAt }]);
    expect(xml).toContain("a&amp;b");
    expect(xml).toContain("2026-11-24T10:00:00.000Z");
    expect(sitemapXml([{ url: "https://example.test/" }])).not.toContain("lastmod");
  });
  it("escapes attributes and script terminators", () => {
    expect(escapeHtml('"<x>&')).toBe("&quot;&lt;x&gt;&amp;");
    expect(jsonLd({ text: "</script>" })).not.toContain("</script>");
  });
});
