export const SITE_URL = "https://biosferee.onrender.com";
export const INDEXNOW_KEY = "89d96fb6be1c632ed427c9cdc072ab709fd74cc31a2662a16718c9c60d556d13";
export const SITEMAP_PAGE_SIZE = 10000;

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

type PublicObservation = {
  id: number;
  commonName?: string | null;
  species?: string | null;
  description: string;
  city: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  images: { url: string }[];
  author: { firstName: string; lastName: string };
};

export function observationDocument(index: string, post: PublicObservation): string {
  const label = post.commonName || post.species || "Tanımlanmamış canlı";
  const title = `${label} · ${post.city} gözlemi — BioSfere`;
  const description = post.description.replace(/\s+/g, " ").trim().slice(0, 220);
  const url = `${SITE_URL}/gonderi/${post.id}`;
  const images = post.images.filter(image => {
    try { return new URL(image.url).protocol === "https:"; } catch { return false; }
  });
  const graph = {
    "@context": "https://schema.org", "@type": "Article", headline: title,
    description, url, mainEntityOfPage: url, inLanguage: "tr",
    datePublished: new Date(post.createdAt).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    author: { "@type": "Person", name: `${post.author.firstName} ${post.author.lastName}`.trim() },
    publisher: { "@type": "Organization", name: "BioSfere", url: SITE_URL },
    ...(images.length ? { image: images.map(image => image.url) } : {}),
  };
  const meta = `
    <link rel="canonical" href="${escapeHtml(url)}">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="BioSfere">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(url)}">
    <meta name="twitter:card" content="${images.length ? "summary_large_image" : "summary"}">
    ${images[0] ? `<meta property="og:image" content="${escapeHtml(images[0].url)}">` : ""}
    <script type="application/ld+json">${jsonLd(graph)}</script>`;
  const preview = `<main style="max-width:850px;margin:auto;padding:32px 20px;font:17px/1.7 system-ui;color:#123c30">
    <nav><a href="/biosfere.html">BioSfere hakkında</a> · <a href="/giris">Giriş yap</a></nav>
    <article><h1>${escapeHtml(label)}</h1>
    <p>${escapeHtml(post.city)} · ${escapeHtml(post.species || "Tür tanımlaması bekleniyor")}</p>
    <p style="white-space:pre-wrap">${escapeHtml(post.description)}</p>
    ${images.slice(0, 6).map(image => `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(label)} gözlemi" style="width:100%;height:auto" loading="lazy">`).join("")}
    <p>${escapeHtml(post.author.firstName)} ${escapeHtml(post.author.lastName)}</p>
    </article><noscript>Gözlemi inceleyebilirsin. Etkileşimli özellikler için JavaScript’i etkinleştir.</noscript></main>`;
  const marker = '<div id="root">';
  const rootStart = index.indexOf(marker);
  // Vite script etiketini head'e taşıyabilir. root'un son kapanışı body içindeki
  // son div'dir, ardından kalan boot kodu korunur.
  const rootEnd = index.lastIndexOf("</div>", index.indexOf("</body>"));
  let document = index
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(description)}">`);
  // Metaveri değişiklikleri root ofsetlerini değiştirdiğinden içerik ayrı değiştirilir.
  if (rootStart >= 0 && rootEnd > rootStart) {
    const original = index.slice(rootStart, rootEnd + 6);
    document = document.replace(original, `${marker}${preview}</div>`);
  }
  // Başlangıç dil kodu gözlem başlığını ve açıklamasını ezmemeli.
  document = document.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (original, body: string) =>
    body.includes("biosfere_locale_current") || body.includes("biosfere-startup-label") ? "" : original);
  return document.replace("</head>", `${meta}\n</head>`);
}

export function sitemapXml(entries: { url: string; updatedAt?: Date | string }[]): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    entries.map(entry => `<url><loc>${escapeHtml(entry.url)}</loc>${entry.updatedAt ? `<lastmod>${new Date(entry.updatedAt).toISOString()}</lastmod>` : ""}</url>`).join("") + "</urlset>";
}

export function sitemapIndexXml(count: number): string {
  const pages = Math.ceil(count / SITEMAP_PAGE_SIZE);
  const urls = [`${SITE_URL}/sitemaps/pages.xml`];
  for (let page = 1; page <= pages; page++) urls.push(`${SITE_URL}/sitemaps/posts-${page}.xml`);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map(url => `<sitemap><loc>${escapeHtml(url)}</loc></sitemap>`).join("") + "</sitemapindex>";
}
