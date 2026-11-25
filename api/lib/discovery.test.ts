import { describe, expect, it } from "vitest";
import { discoveryDocument, discoveryPath, observationsRss, parseDiscoveryQuery, publicDiscoveryItems, type DiscoveryObservation } from "./discovery";

const post: DiscoveryObservation = {
  id: 7, commonName: "Sibirya Elmacığı", species: "Malus baccata", kingdom: "Plantae",
  description: "Bir saha gözlemi & ayrıntıları.", city: "Erzincan", status: "verified",
  createdAt: "2026-11-23T10:00:00Z", updatedAt: "2026-11-24T10:00:00Z",
  images: [{ url: "https://res.cloudinary.com/example/image/upload/v1/flower.jpg" }],
};

describe("public discovery data and rendering", () => {
  it("bounds pagination and rejects unsupported filters", () => {
    for (const value of ["0", "-1", "1.5", "1001", "1e3", "", "NaN"]) {
      expect(parseDiscoveryQuery(value, undefined)).toBeNull();
    }
    expect(parseDiscoveryQuery("2", "Plantae")).toEqual({ page: 2, kingdom: "Plantae" });
    expect(parseDiscoveryQuery(undefined, "Alien")).toBeNull();
  });
  it("removes moderated records and projects only public discovery fields", () => {
    const input = { ...post, author: { email: "private@example.test", passwordHash: "secret" }, lat: 40, lng: 38, locality: "private detail", adminNotes: "internal" };
    const items = publicDiscoveryItems([input, { ...post, id: 8, status: "removed" }]);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(post);
    expect(JSON.stringify(items)).not.toMatch(/private@example|passwordHash|adminNotes|locality|"lat"|"lng"/);
  });
  it("escapes user content in HTML and JSON-LD", () => {
    const html = discoveryDocument({ items: [{ ...post, commonName: '</script><img src=x onerror="alert(1)">', description: '<script>alert(2)</script>' }], nextPage: null }, "tr", { page: 1 });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(2)</script>');
    expect(html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(html).toContain("\\u003c/script>");
  });
  it("does not embed unsafe media URLs or raw video files as photos", () => {
    const html = discoveryDocument({ items: [{ ...post, images: [{ url: "javascript:alert(1)" }, { url: "https://example.test/video.mp4" }] }], nextPage: null }, "en", { page: 1 });
    expect(html).not.toContain('src="javascript:');
    expect(html).not.toContain('src="https://example.test/video.mp4"');
    expect(html).toContain("Open observation to view media");
  });
  it("provides useful content, optimized photos and real observation links without app scripts", () => {
    const html = discoveryDocument({ items: [post], nextPage: 2 }, "en", { page: 1 });
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('href="/gonderi/7"');
    expect(html).toContain("c_limit,w_700,f_auto,q_auto");
    expect(html).toContain('rel="next" href="/explore?page=2"');
    expect(html).toContain("Create a free account");
    expect(html).not.toMatch(/<script[^>]*src=/);
  });
  it("retains language and filters through pagination and avoids indexing filter combinations", () => {
    const query = { page: 2, kingdom: "Plantae" as const };
    expect(discoveryPath("en", query)).toBe("/explore?kingdom=Plantae&page=2");
    const html = discoveryDocument({ items: [post], nextPage: 3 }, "en", query);
    expect(html).toContain('content="noindex,follow"');
    expect(html).toContain('href="https://biosferee.onrender.com/kesfet?kingdom=Plantae&amp;page=2"');
    expect(html).toContain('rel="next" href="/explore?kingdom=Plantae&amp;page=3"');
  });
  it("does not present observer-entered identifications as independently verified", () => {
    const html = discoveryDocument({ items: [post, { ...post, id: 8, status: "unknown", species: null, commonName: null }], nextPage: null }, "en", { page: 1 });
    expect(html).toContain("Species information entered");
    expect(html).toContain("Identification pending");
    expect(html).not.toContain("Verified species");
  });
  it("creates RSS with stable identifiers, valid dates and escaped rich descriptions", () => {
    const rss = observationsRss([{ ...post, commonName: "A & B", description: "<script>alert(1)</script>\u0000" }]);
    expect(rss).toContain("<title>A &amp; B</title>");
    expect(rss).toContain('<guid isPermaLink="true">https://biosferee.onrender.com/gonderi/7</guid>');
    expect(rss).toContain("<pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate>");
    expect(rss).toContain("&amp;lt;script&amp;gt;");
    expect(rss).not.toContain("\u0000");
    expect(rss).not.toContain("<script>");
    expect(observationsRss([{ ...post, status: "removed" }])).not.toContain("<item>");
  });
  it("omits invalid dates instead of breaking the feed", () => {
    expect(observationsRss([{ ...post, createdAt: "not a date" }])).not.toContain("<pubDate>");
  });
});
