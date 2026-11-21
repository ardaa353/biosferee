import {describe, expect, it} from "vitest";
import {buildTaxonomyTree} from "./taxonomyTree";
import {validCoordinates} from "./geography";
import type {BioPost} from "./types";
const sample = (overrides: Partial<BioPost> = {}) => ({id: 1, status: "verified", kingdom: "Plantae", phylum: "Tracheophyta", className: "Magnoliopsida", orderName: "Ericales", family: "Ebenaceae", genus: "Diospyros", species: "Diospyros kaki", commonName: "Trabzon hurması", ...overrides} as BioPost);
describe("Sistematik gezinme ve harita verileri", () => {
  it("yedi basamağı korur, aynı türün kayıtlarını birleştirir ve kaldırılan kayıtları dışarıda bırakır", () => {
    const tree = buildTaxonomyTree([sample(), sample({id: 2}), sample({id: 3, status: "removed"})]);
    let branch = tree[0];
    const names = [branch.name];
    while (branch.children.length) {branch = branch.children[0]; names.push(branch.name);}
    expect(names).toEqual(["Plantae", "Tracheophyta", "Magnoliopsida", "Ericales", "Ebenaceae", "Diospyros", "Diospyros kaki"]);
    expect(tree[0].count).toBe(2); expect(branch.posts.map(post => post.id)).toEqual([1, 2]);
  });
  it("Türkçe yaygın adla ve boşluklu sorguyla doğru türü bulur; eksik sınıflandırma dalı kaydı kaybetmez", () => {
    const tree = buildTaxonomyTree([sample({phylum: ""}), sample({status: "unknown"})], "  HURMASI  ");
    expect(tree).toHaveLength(1); expect(tree[0].children[0].name).toBe("Şube / bölüm belirtilmedi");
    expect(buildTaxonomyTree([sample()], "kedi")).toHaveLength(0);
  });
  it("sıfır koordinatını kabul ederken bozuk ve aralık dışı konumları haritaya geçirmez", () => {
    expect(validCoordinates({lat: 0, lng: 0})).toBe(true);
    expect(validCoordinates({lat: NaN, lng: 38})).toBe(false);
    expect(validCoordinates({lat: 40, lng: Infinity})).toBe(false);
    expect(validCoordinates({lat: 91, lng: 38})).toBe(false);
    expect(validCoordinates({lat: 40, lng: -181})).toBe(false);
  });
});
