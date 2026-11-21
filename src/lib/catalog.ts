import type { CatalogResponse, Rank, TaxonHit } from "@contracts/taxonomy";
const cache = new Map<string, CatalogResponse>();
export async function catalogSearch(text: string, rank: Rank, signal: AbortSignal): Promise<CatalogResponse> {
  const q = text.trim(), key = rank + "/" + q.toLowerCase();
  const previous = cache.get(key);
  if (previous) return previous;
  const response = await fetch("/api/taxa?" + new URLSearchParams({ q, rank }), { signal });
  if (!response.ok) throw new Error("Kataloğa ulaşılamadı. Alanları elle doldurabilirsin.");
  const result: CatalogResponse = await response.json();
  if (cache.size >= 160) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

export function exactMatch(results: TaxonHit[], name: string, kingdom: string): TaxonHit | undefined {
  const normalized = name.toLowerCase();
  const matches = results.filter(item => item.taxonomy.kingdom === kingdom &&
    [item.name, item.matched].some(value => value.toLowerCase() === normalized));
  return matches.length === 1 ? matches[0] : undefined;
}
