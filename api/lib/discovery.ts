import { isVideoUrl } from "../../contracts/media";
import { escapeHtml, jsonLd, SITE_URL } from "./seo";

export const DISCOVERY_PAGE_SIZE = 12;
export const DISCOVERY_KINGDOMS = ["Animalia", "Plantae", "Fungi"] as const;
export type DiscoveryLanguage = "tr" | "en";
export type DiscoveryQuery = { page: number; kingdom?: typeof DISCOVERY_KINGDOMS[number] };
export type DiscoveryObservation = {
  id: number; commonName?: string | null; species?: string | null; kingdom?: string | null;
  description: string; city: string; status: string; createdAt: Date | string;
  updatedAt: Date | string; images: { url: string }[];
};
export type DiscoveryPage = { items: DiscoveryObservation[]; nextPage: number | null };

export function publicDiscoveryItems(items: DiscoveryObservation[]): DiscoveryObservation[] {
  return items.filter(post => post.status !== "removed").map(post => ({
    id: post.id, commonName: post.commonName, species: post.species, kingdom: post.kingdom,
    description: post.description, city: post.city, status: post.status,
    createdAt: post.createdAt, updatedAt: post.updatedAt, images: post.images.map(image => ({ url: image.url })),
  }));
}

export function parseDiscoveryQuery(page: string | undefined, kingdom: string | undefined): DiscoveryQuery | null {
  const value = page ?? "1";
  if (!/^[1-9]\d{0,3}$/.test(value) || Number(value) > 1000) return null;
  if (kingdom && !DISCOVERY_KINGDOMS.includes(kingdom as typeof DISCOVERY_KINGDOMS[number])) return null;
  return { page: Number(value), ...(kingdom ? { kingdom: kingdom as typeof DISCOVERY_KINGDOMS[number] } : {}) };
}
export function discoveryPath(language: DiscoveryLanguage, query: DiscoveryQuery = { page: 1 }): string {
  const params = new URLSearchParams();
  if (query.kingdom) params.set("kingdom", query.kingdom);
  if (query.page > 1) params.set("page", String(query.page));
  return (language === "tr" ? "/kesfet" : "/explore") + (params.size ? "?" + params.toString() : "");
}
const copy = {
  tr: {
    title: "Doğa gözlemlerini keşfet", description: "Fotoğraflı canlı gözlemlerini kayıt olmadan incele. Bitkileri, hayvanları ve mantarları keşfet; kendi gözlemini BioSfere'ye ekle.",
    eyebrow: "BİRLİKTE DOĞAYI KAYDA ALALIM", intro: "Önce gözlemleri incele. Bir canlı dikkatini çektiğinde ücretsiz hesabınla kendi fotoğrafını ve gözlem notlarını paylaş.",
    about: "BioSfere hakkında", app: "Uygulamayı aç", signup: "Ücretsiz hesap oluştur", all: "Tümü",
    Animalia: "Hayvanlar", Plantae: "Bitkiler", Fungi: "Mantarlar", language: "English", filter: "Canlı grubuna göre filtrele",
    unknown: "Tanımlama bekliyor", named: "Tür bilgisi girilmiş", unnamed: "Tanımlanmamış canlı", open: "Gözlemi incele",
    empty: "Bu seçimde henüz gözlem yok.", emptyText: "Başka bir canlı grubuna bakabilir veya kendi gözlemini paylaşabilirsin.",
    previous: "Önceki sayfa", next: "Sonraki sayfa", pagination: "Gözlem sayfaları", page: "Sayfa",
    action: "Senin gözlemin de burada olsun", actionText: "Kendi çektiğin bir fotoğrafla başla. Tarih, gözlem yeri ve bildiğin tür bilgisini ekle.",
    note: "Tür bilgileri gözlemcilerin kayıtlarıdır. Fotoğraftan öneriler kesin teşhis yerine geçmez.", rss: "RSS ile yeni gözlemleri takip et",
    missingPhoto: "Görsel için gözlemi aç", location: "Yer bilgisi belirtilmemiş",
  },
  en: {
    title: "Explore nature observations", description: "Browse biodiversity observations without an account. Discover plants, animals and fungi, then share your own nature observations on BioSfere.",
    eyebrow: "LET'S KEEP A RECORD OF NATURE", intro: "Explore observations first. When something catches your eye, create a free account to share your own photograph and field notes.",
    about: "About BioSfere", app: "Open the app", signup: "Create a free account", all: "All",
    Animalia: "Animals", Plantae: "Plants", Fungi: "Fungi", language: "Türkçe", filter: "Filter by organism group",
    unknown: "Identification pending", named: "Species information entered", unnamed: "Unidentified organism", open: "View observation",
    empty: "No observations match this selection yet.", emptyText: "Try another organism group or share an observation of your own.",
    previous: "Previous page", next: "Next page", pagination: "Observation pages", page: "Page",
    action: "Your observation can be here too", actionText: "Start with a photograph you took. Add the date, observation location and identification you know.",
    note: "Species information is recorded by observers. Photo-based suggestions are not confirmed identifications.", rss: "Follow new observations with RSS",
    missingPhoto: "Open observation to view media", location: "Location not specified",
  },
} as const;

function safePhoto(post: DiscoveryObservation): string | null {
  for (const image of post.images) {
    try {
      if (new URL(image.url).protocol !== "https:" || isVideoUrl(image.url)) continue;
      return /^https:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\/v\d+\//.test(image.url)
        ? image.url.replace("/image/upload/", "/image/upload/c_limit,w_700,f_auto,q_auto/") : image.url;
    } catch { /* Only valid HTTPS image URLs are embedded. */ }
  }
  return null;
}
const style = `body{margin:0;background:#f4f7f4;color:#163c2d;font:17px/1.65 system-ui,-apple-system,sans-serif}*{box-sizing:border-box}a{color:#166442;text-underline-offset:4px}.wrap{max-width:1160px;margin:auto;padding:0 24px}header{background:#fff;border-bottom:1px solid #d7e3d8}.nav{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding-top:18px;padding-bottom:18px}.brand{font:bold 27px Georgia,serif;text-decoration:none}.links,.filters,.pager{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.hero{padding:48px 0 28px;max-width:800px}.eyebrow{font-size:12px;letter-spacing:.12em;font-weight:700}h1{font:600 clamp(32px,5vw,54px)/1.12 Georgia,serif;margin:14px 0 20px}h2{line-height:1.3}.button,.filter{display:inline-block;text-decoration:none;border:1px solid #bdd0c0;border-radius:7px;padding:10px 16px;min-height:44px}.primary,.filter[aria-current=true]{background:#166442;color:white;border-color:#166442}.filters{margin:0 0 28px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}.card{background:#fff;border:1px solid #d2e1d4;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}.media{display:block;aspect-ratio:4/3;background:#e5eee5;overflow:hidden}.media img{display:block;width:100%;height:100%;object-fit:cover}.placeholder{display:grid;place-items:center;height:100%;padding:20px;text-align:center;color:#52675b}.body{padding:20px;display:flex;flex-direction:column;flex:1}.badge{font-size:12px;font-weight:700;color:#52675b}.card h2{font:600 25px/1.2 Georgia,serif;margin:8px 0}.card h2 a{text-decoration:none}.species{font-style:italic;color:#52675b;overflow-wrap:anywhere}.meta{font-size:14px;color:#52675b}.excerpt{overflow-wrap:anywhere}.open{margin-top:auto;font-weight:600}.pager{justify-content:space-between;margin:30px 0}.callout,.empty{border:1px solid #d2e1d4;border-radius:12px;background:white;padding:28px;margin:32px 0}.callout h2{margin-top:0}.small{font-size:14px;color:#52675b}footer{margin-top:40px;padding:24px 0 36px;border-top:1px solid #d2e1d4}a:focus-visible{outline:3px solid #997200;outline-offset:4px}@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.wrap{padding-left:18px;padding-right:18px}.grid{grid-template-columns:1fr}.hero{padding-top:30px}.links{gap:8px;font-size:14px}.nav{align-items:flex-start}.callout{padding:20px}}`;

export function discoveryDocument(data: DiscoveryPage, language: DiscoveryLanguage, query: DiscoveryQuery): string {
  data = { ...data, items: publicDiscoveryItems(data.items) };
  const t = copy[language], path = discoveryPath(language, query);
  const previewPhoto = data.items.map(safePhoto).find(Boolean);
  const other = language === "tr" ? "en" : "tr";
  const about = language === "tr" ? "/biosfere.html" : "/biosfere-en.html";
  const current = SITE_URL + path;
  const filtered = query.page > 1 || Boolean(query.kingdom);
  const alternates = (["tr", "en"] as const).map(lang => `<link rel="alternate" hreflang="${lang}" href="${escapeHtml(SITE_URL + discoveryPath(lang, query))}">`).join("");
  const cards = data.items.map((post, index) => {
    const label = post.commonName || post.species || t.unnamed;
    const url = "/gonderi/" + post.id, photo = safePhoto(post);
    const date = new Date(post.createdAt);
    const dateText = Number.isFinite(date.valueOf()) ? date.toLocaleDateString(language === "tr" ? "tr-TR" : "en-GB", { timeZone: "Europe/Istanbul" }) : "";
    return `<article class="card"><a class="media" href="${url}" aria-label="${escapeHtml(t.open + ": " + label)}">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(label)}" width="700" height="525" loading="${index === 0 ? "eager" : "lazy"}" decoding="async">` : `<span class="placeholder">${t.missingPhoto}</span>`}</a><div class="body"><span class="badge">${post.status === "unknown" ? t.unknown : t.named}</span><h2><a href="${url}">${escapeHtml(label)}</a></h2>${post.species && post.species !== label ? `<span class="species">${escapeHtml(post.species)}</span>` : ""}<p class="meta">${escapeHtml(post.city || t.location)}${dateText ? " · " + dateText : ""}</p><p class="excerpt">${escapeHtml(post.description.replace(/\s+/g, " ").trim().slice(0, 180))}</p><a class="open" href="${url}">${t.open} →</a></div></article>`;
  }).join("");
  const filters = [[undefined, t.all], ...DISCOVERY_KINGDOMS.map(key => [key, t[key]])].map(([key, label]) => `<a class="filter" href="${escapeHtml(discoveryPath(language, { page: 1, ...(key ? { kingdom: key as DiscoveryQuery["kingdom"] } : {}) }))}" aria-current="${(query.kingdom ?? "") === (key ?? "") ? "true" : "false"}">${label}</a>`).join("");
  const graph = { "@context": "https://schema.org", "@type": "CollectionPage", name: t.title, description: t.description, url: current, inLanguage: language, mainEntity: { "@type": "ItemList", itemListElement: data.items.map((post, index) => ({ "@type": "ListItem", position: (query.page - 1) * DISCOVERY_PAGE_SIZE + index + 1, url: SITE_URL + "/gonderi/" + post.id, name: post.commonName || post.species || t.unnamed })) } };
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.title} — BioSfere</title><meta name="description" content="${escapeHtml(t.description)}"><link rel="canonical" href="${escapeHtml(current)}">${alternates}<meta name="robots" content="${filtered ? "noindex,follow" : "index,follow,max-image-preview:large"}"><meta property="og:type" content="website"><meta property="og:site_name" content="BioSfere"><meta property="og:title" content="${t.title} — BioSfere"><meta property="og:description" content="${escapeHtml(t.description)}"><meta property="og:url" content="${escapeHtml(current)}"><meta name="twitter:card" content="${previewPhoto ? "summary_large_image" : "summary"}">${previewPhoto ? `<meta property="og:image" content="${escapeHtml(previewPhoto)}">` : ""}<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="alternate" type="application/rss+xml" title="BioSfere observations" href="${SITE_URL}/gozlemler.rss"><script type="application/ld+json">${jsonLd(graph)}</script><style>${style}</style></head><body><header><nav class="wrap nav" aria-label="BioSfere"><a class="brand" href="${discoveryPath(language)}">BioSfere</a><div class="links"><a href="${escapeHtml(discoveryPath(other, query))}" lang="${other}">${t.language}</a><a href="${about}">${t.about}</a><a href="/akis">${t.app}</a><a class="button primary" href="/kayit?next=%2Fpaylas">${t.signup}</a></div></nav></header><main class="wrap"><section class="hero"><span class="eyebrow">${t.eyebrow}</span><h1>${t.title}</h1><p>${t.intro}</p></section><nav class="filters" aria-label="${t.filter}">${filters}</nav>${data.items.length ? `<div class="grid">${cards}</div>` : `<section class="empty"><h2>${t.empty}</h2><p>${t.emptyText}</p><a class="button primary" href="/kayit?next=%2Fpaylas">${t.signup}</a></section>`}<nav class="pager" aria-label="${t.pagination}">${query.page > 1 ? `<a class="button" rel="prev" href="${escapeHtml(discoveryPath(language, { ...query, page: query.page - 1 }))}">← ${t.previous}</a>` : "<span></span>"}<span class="small">${t.page} ${query.page}</span>${data.nextPage ? `<a class="button" rel="next" href="${escapeHtml(discoveryPath(language, { ...query, page: data.nextPage }))}">${t.next} →</a>` : "<span></span>"}</nav><section class="callout"><h2>${t.action}</h2><p>${t.actionText}</p><a class="button primary" href="/kayit?next=%2Fpaylas">${t.signup}</a></section><p class="small">${t.note}</p></main><footer class="wrap"><div class="links"><a href="${about}">${t.about}</a><a href="/gozlemler.rss">${t.rss}</a></div></footer></body></html>`;
}
function xmlText(value: unknown): string {
  return escapeHtml(String(value ?? "").replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, ""));
}
export function observationsRss(items: DiscoveryObservation[]): string {
  const entries = publicDiscoveryItems(items).map(post => {
    const url = SITE_URL + "/gonderi/" + post.id, label = post.commonName || post.species || "BioSfere observation";
    const date = new Date(post.createdAt), photo = safePhoto(post);
    const description = `<p>${escapeHtml(post.description)}</p>${photo ? `<p><a href="${url}"><img src="${escapeHtml(photo)}" alt="${escapeHtml(label)}"></a></p>` : ""}<p><a href="${url}">BioSfere · ${escapeHtml(label)}</a></p>`;
    return `<item><title>${xmlText(label)}</title><link>${xmlText(url)}</link><guid isPermaLink="true">${xmlText(url)}</guid><description>${xmlText(description)}</description>${Number.isFinite(date.valueOf()) ? `<pubDate>${date.toUTCString()}</pubDate>` : ""}</item>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>BioSfere — Gözlemler / Observations</title><link>${SITE_URL}/explore</link><description>Latest public biodiversity observations with photos and field notes. BioSfere son canlı gözlemleri.</description><atom:link href="${SITE_URL}/gozlemler.rss" rel="self" type="application/rss+xml"/>${entries}</channel></rss>`;
}
