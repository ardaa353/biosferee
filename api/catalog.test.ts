import {describe, expect, it} from "vitest";
import { searchCatalog } from "./lib/catalog";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const catalogue = resolve("dist/data/col-2026-10-16-xr.sqlite");
describe.skipIf(!existsSync(catalogue))("Catalogue of Life XR", () => {
  it("fındığı yedi basamağıyla, mantarı ve cinsi kendi sınıflandırmalarıyla getirir", async () => {
    const { results } = await searchCatalog("FINDIK", "species");
    const hazel = results.find(x => x.name === "Corylus avellana");
    expect(hazel?.taxonomy).toMatchObject({ kingdom: "Plantae", phylum: "Tracheophyta", className: "Magnoliopsida", orderName: "Fagales", family: "Betulaceae", genus: "Corylus", species: "Corylus avellana" });
    expect(hazel?.taxonomy.commonName).toBeTruthy();
    expect((await searchCatalog("Felis leo", "species")).results.some(x => x.name === "Panthera leo")).toBe(true);
    expect((await searchCatalog("Saccharomyces cerevisiae", "species")).results[0].taxonomy.kingdom).toBe("Fungi");
    expect((await searchCatalog("Quercus", "genus")).results[0].taxonomy.species).toBe("");
    expect((await searchCatalog("qzzqzzqzz", "species")).results).toEqual([]);
  });
});


describe("Katalog HTTP uç noktası", () => {
  it("geçersiz sorguları reddeder ve oturumsuz sağlık yanıtı verir", async () => {
    const app = (await import("./boot")).default;
    expect((await app.request("/api/taxa?q=a&rank=invalid")).status).toBe(400);
    expect((await app.request("/api/trpc/ping")).status).toBe(200);
  });
  it.skipIf(!existsSync(catalogue))("tür aramasını yerel arşivden sunar", async () => {
    const app = (await import("./boot")).default;
    const response = await app.request("/api/taxa?q=Ara%20macao&rank=species");
    expect(response.status).toBe(200);
    const data = await response.json() as { source: string; results: {taxonomy: {family: string}}[] };
    expect(data.source).toBe("Catalogue of Life");
    expect(data.results[0].taxonomy.family).toBe("Psittacidae");
  });
});
