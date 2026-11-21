import type {SpeciesProfile} from "../../contracts/taxonomy";

type Photo = {id?: number; medium_url?: string; url?: string; license_code?: string; attribution?: string};
type Taxon = {id: number; name: string; matched_term?: string; ancestor_ids?: number[]; names?: {name: string; locale?: string; is_valid?: boolean}[]; english_common_name?: string; default_photo?: Photo};
const cache = new Map<string, {expires: number; value: SpeciesProfile}>();
const pending = new Map<string, Promise<SpeciesProfile>>();
const openLicenses = new Set(["cc0", "cc-by", "cc-by-sa"]);
const kingdomIds: Record<string, number> = {Animalia: 1, Plantae: 47126, Fungi: 47170};
let queue: Promise<void> = Promise.resolve(), nextRequestAt = 0, unavailableUntil = 0;
async function query<T>(path: string, parameters: Record<string, string>): Promise<T> {
  if (Date.now() < unavailableUntil) throw new Error("Tür bilgi kaynağı geçici olarak beklemede.");
  // Cache shared taxon profiles and start at most one public API request per second.
  const turn = queue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 1050;
  });
  queue = turn.catch(() => {});
  await turn;
  if (Date.now() < unavailableUntil) throw new Error("Tür bilgi kaynağı geçici olarak beklemede.");
  const response = await fetch("https://api.inaturalist.org/v1/" + path + "?" + new URLSearchParams(parameters), {
    headers: {"User-Agent": "BioSfere/1.0 (+https://biosferee.onrender.com)"}, signal: AbortSignal.timeout(8000),
  });
  if (response.status === 429) unavailableUntil = Date.now() + Math.max(60, Number(response.headers.get("retry-after")) || 60) * 1000;
  if (!response.ok) throw new Error("Tür bilgi kaynağı kullanılamıyor.");
  return response.json() as Promise<T>;
}
function photoInfo(photo?: Photo): SpeciesProfile["photo"] {
  const license = photo?.license_code?.toLowerCase() || "";
  if (!photo || !openLicenses.has(license) || !Number.isSafeInteger(photo.id)) return;
  try {
    const url = new URL(photo.medium_url || photo.url || "");
    if (url.protocol !== "https:") return;
    url.pathname = url.pathname.replace(/\/square(\.[a-z0-9]+)$/i, "/medium$1");
    return {url: url.href, credit: (photo.attribution || "iNaturalist").slice(0, 220), license: license.toUpperCase(), pageUrl: "https://www.inaturalist.org/photos/" + photo.id};
  } catch { return; }
}
async function lookup(species: string, kingdom: string): Promise<SpeciesProfile> {
  const empty: SpeciesProfile = {species, commonName: "", commonNameLanguage: ""};
  const data = await query<{results?: Taxon[]}>("taxa", {q: species, rank: "species", locale: "tr", all_names: "true", is_active: "true", per_page: "5"});
  const normalized = species.toLowerCase(), kingdomId = kingdomIds[kingdom];
  const hits = ((data.results || []) as Taxon[]).filter(taxon =>
    [taxon.name, taxon.matched_term].some(name => name?.toLowerCase() === normalized) &&
    (!kingdomId || taxon.ancestor_ids?.includes(kingdomId)));
  if (hits.length !== 1) return empty;
  const taxon = hits[0];
  const turkish = taxon.names?.find(name => name.is_valid !== false && name.locale === "tr")?.name;
  const english = taxon.english_common_name || taxon.names?.find(name => name.is_valid !== false && name.locale === "en")?.name;
  const value: SpeciesProfile = {...empty, commonName: (turkish || english || "").slice(0, 200), commonNameLanguage: turkish ? "tr" : english ? "en" : "", pageUrl: "https://www.inaturalist.org/taxa/" + taxon.id};
  value.photo = photoInfo(taxon.default_photo);
  if (!value.photo) {
    try {
      const observations = await query<{results?: {photos?: Photo[]}[]}>("observations", {taxon_id: String(taxon.id), photos: "true", photo_license: "cc0,cc-by,cc-by-sa", quality_grade: "research", per_page: "3", order_by: "votes"});
      value.photo = (observations.results || []).flatMap((observation: {photos?: Photo[]}) => (observation.photos || []).map(photoInfo)).find(Boolean);
    } catch { /* The name still remains useful if the image service is unavailable. */ }
  }
  return value;
}
export function speciesProfile(species: string, kingdom: string): Promise<SpeciesProfile> {
  const key = kingdom + "/" + species.toLowerCase(), previous = cache.get(key);
  if (previous && previous.expires > Date.now()) return Promise.resolve(previous.value);
  const running = pending.get(key);
  if (running) return running;
  if (pending.size >= 30) return Promise.resolve({species, commonName: "", commonNameLanguage: ""});
  const result = lookup(species, kingdom).then(value => {
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(key, {value, expires: Date.now() + 6 * 60 * 60 * 1000});
    return value;
  }).catch((): SpeciesProfile => ({species, commonName: "", commonNameLanguage: ""})).finally(() => pending.delete(key));
  pending.set(key, result);
  return result;
}
