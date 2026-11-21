export const ranks = ["kingdom", "phylum", "className", "orderName", "family", "genus", "species"] as const;
export type Rank = typeof ranks[number];
export const emptyTaxonomy = { kingdom: "", phylum: "", className: "", orderName: "", family: "", genus: "", species: "", commonName: "" };
export type Taxonomy = typeof emptyTaxonomy;
export const rankLabels: Record<keyof Taxonomy, string> = { kingdom: "Alem", phylum: "Şube / bölüm", className: "Sınıf", orderName: "Takım", family: "Familya", genus: "Cins", species: "Bilimsel tür adı", commonName: "Türkçe yaygın ad" };
export type TaxonHit = { id: string; name: string; matched: string; rank: Rank; taxonomy: Taxonomy };
export type CatalogResponse = { source: "Catalogue of Life" | "GBIF"; results: TaxonHit[] };
export type SpeciesProfile = {
  species: string;
  commonName: string;
  commonNameLanguage: "tr" | "en" | "";
  pageUrl?: string;
  photo?: {url: string; credit: string; license: string; pageUrl: string};
};
