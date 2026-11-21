import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const CATALOG_RANKS = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'] as const;
export type CatalogRank = (typeof CATALOG_RANKS)[number];
export type CatalogMatch = {
  id: number;
  name: string;
  rank: CatalogRank;
  matchedName: string;
  taxonomy: Partial<Record<CatalogRank, string>>;
  commonName?: string;
};

export const CATALOG_RELEASE = '2026-10-16 XR';
const dbFile = () => process.env.COL_DATABASE_PATH || resolve('dist/data/col-2026-10-16-xr.sqlite');

function openCatalog() {
  const db = new DatabaseSync(dbFile(), { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-4096;');
    return {
      db,
      accepted: db.prepare('SELECT id,name AS term FROM taxa WHERE rank=? AND name>=? AND name<? ORDER BY name,id LIMIT ?'),
      synonyms: db.prepare('SELECT target AS id,name AS term FROM aliases WHERE rank=? AND name>=? AND name<? ORDER BY name,target LIMIT ?'),
      common: db.prepare('SELECT target AS id,name AS term FROM common WHERE rank=? AND normalized>=? AND normalized<? ORDER BY normalized,target,name LIMIT ?'),
      taxon: db.prepare('SELECT id,parent,rank,name FROM taxa WHERE id=?'),
      preferred: db.prepare('SELECT name FROM common WHERE target=? ORDER BY preferred DESC,name LIMIT 1'),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

type Catalog = ReturnType<typeof openCatalog>;
let catalog: Catalog | undefined;

export function catalogAvailable(): boolean {
  if (catalog) return true;
  if (!existsSync(dbFile())) return false;
  catalog = openCatalog();
  return true;
}

type Hit = { id: number; term: string };
type Taxon = { id: number; parent: number | null; rank: number; name: string };
const upper = (prefix: string) => `${prefix}\u{10ffff}`;
const commonKey = (term: string) => term.toLowerCase().replace(/ı/g, 'i').normalize('NFD').replace(/\p{M}/gu, '');

export function searchCatalog(rank: CatalogRank, query: string, limit = 10): CatalogMatch[] {
  if (!catalogAvailable() || !catalog) return [];
  const rankId = CATALOG_RANKS.indexOf(rank);
  if (rankId < 0) return [];
  const prefix = query.trim().normalize('NFC').slice(0, 140);
  const cap = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.floor(limit))) : 10;
  const lower = commonKey(prefix);
  const accepted = catalog.accepted.all(rankId, prefix, upper(prefix), cap) as Hit[];
  const common = prefix ? catalog.common.all(rankId, lower, upper(lower), cap) as Hit[] : [];
  const synonyms = prefix ? catalog.synonyms.all(rankId, prefix, upper(prefix), cap) as Hit[] : [];
  const candidates = [accepted, common, synonyms].flatMap((hits, source) => hits.map(hit => ({
    ...hit,
    matchedCommon: source === 1 ? hit.term : undefined,
    priority: (commonKey(hit.term) === lower ? 0 : 3) + source,
  })));
  candidates.sort((a, b) => a.priority - b.priority || a.term.localeCompare(b.term, 'tr') || a.id - b.id);

  const seen = new Set<number>();
  const ancestors = new Map<number, Taxon>();
  const results: CatalogMatch[] = [];
  for (const hit of candidates) {
    if (seen.has(hit.id)) continue;
    const row = catalog.taxon.get(hit.id) as Taxon | undefined;
    if (!row) continue;
    seen.add(hit.id);
    const taxonomy: CatalogMatch['taxonomy'] = {};
    let ancestor: Taxon | undefined = row;
    while (ancestor) {
      taxonomy[CATALOG_RANKS[ancestor.rank]] = ancestor.name;
      if (ancestor.parent === null) break;
      let parent: Taxon | undefined = ancestors.get(ancestor.parent);
      if (!parent) {
        parent = catalog.taxon.get(ancestor.parent) as Taxon | undefined;
        if (parent) ancestors.set(parent.id, parent);
      }
      ancestor = parent;
    }
    const preferred = hit.matchedCommon ?? catalog.preferred.get(hit.id)?.name;
    results.push({ id: hit.id, name: row.name, rank, matchedName: hit.term, taxonomy,
      ...(typeof preferred === 'string' ? { commonName: preferred } : {}) });
    if (results.length === cap) break;
  }
  return results;
}
