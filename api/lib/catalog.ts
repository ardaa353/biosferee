import { emptyTaxonomy, type CatalogResponse, type Rank } from "../../contracts/taxonomy";
import { catalogAvailable, searchCatalog as lookup } from "./catalog-local";

const rankMap = { kingdom: "kingdom", phylum: "phylum", className: "class", orderName: "order", family: "family", genus: "genus", species: "species" } as const;

export async function searchCatalog(query: string, rank: Rank): Promise<CatalogResponse> {
  if (!catalogAvailable()) throw new Error("Tür kataloğu şu anda kullanılamıyor.");
  const results = lookup(rankMap[rank], query, rank === "kingdom" && !query ? 20 : 12).map(hit => {
    const taxonomy = { ...emptyTaxonomy, commonName: hit.commonName || "" };
    for (const key of Object.keys(rankMap) as Rank[]) taxonomy[key] = hit.taxonomy[rankMap[key]] || "";
    return { id: "col-" + hit.id, name: hit.name, matched: hit.matchedName, rank, taxonomy };
  });
  return { source: "Catalogue of Life", results };
}
