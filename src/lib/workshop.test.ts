import {describe, expect, it} from "vitest";
import {parseCsv, parseTaxonLabel, mergeCandidates, databaseCandidates} from "./onlineIdentification";
import {applyTaxonomy, buildWorkshopArchive, movePhotos, newWorkshopGroup, type WorkshopPhoto} from "./workshop";

describe("online identification and web workshop", () => {
  it("extracts all scientific ranks without treating an English common name as Turkish", () => {
    const tax = parseTaxonLabel("Animalia Chordata Mammalia Carnivora Felidae Felis catus (Cat)");
    expect(tax).toMatchObject({kingdom: "Animalia", orderName: "Carnivora", genus: "Felis", species: "Felis catus", commonName: ""});
    expect(() => parseTaxonLabel("Felis catus")).toThrow();
  });
  it("uses every photo once and does not multiply repeated species within one photo", () => {
    const taxonomy = parseTaxonLabel("Animalia Chordata Mammalia Carnivora Felidae Felis catus (Cat)");
    const other = {...taxonomy, species: "Leopardus geoffroyi"};
    const result = mergeCandidates([[{taxonomy, score: .8}, {taxonomy, score: .6}], [{taxonomy: other, score: .9}, {taxonomy, score: .2}]]);
    expect(result[0].taxonomy.species).toBe("Felis catus");
    expect(result[0].score).toBeCloseTo(.5);
    expect(result[1].score).toBeCloseTo(.45);
  });
  it("reads quoted CSV records and preserves database taxonomy", () => {
    const rows = parseCsv('kingdom,genus,species,common_name,source_dataset\r\nPlantae,Bellis,perennis,"Common, daisy","line 1\nline ""2"""\r\n');
    expect(rows[0].source_dataset).toBe('line 1\nline "2"');
    expect(databaseCandidates(rows)[0].taxonomy.species).toBe("Bellis perennis");
    expect(() => parseCsv('a\n"unclosed')).toThrow();
  });
  it("moves photographs between groups without duplicating assignments or retaining stale analysis", () => {
    const first = newWorkshopGroup(["a", "b"]), second = newWorkshopGroup(["c"]);
    first.analysis = {candidates: [], source: "old", photoCount: 2, references: []};
    const result = movePhotos([first, second], ["b"], second);
    expect(result.map(group => group.photoIds)).toEqual([["a"], ["c", "b"]]);
    expect(result[0].analysis).toBeUndefined();
    expect(first.photoIds).toEqual(["a", "b"]);
  });
  it("updates generated descriptions when choosing another candidate while preserving human edits", () => {
    const group = newWorkshopGroup(["a", "b"]);
    group.analysis = {source: "test", candidates: [], photoCount: 2, references: []};
    const cat = parseTaxonLabel("Animalia Chordata Mammalia Carnivora Felidae Felis catus");
    const first = applyTaxonomy(group, cat);
    expect(first.fields.description).toContain("Felis catus");
    const other = {...cat, genus: "Leopardus", species: "Leopardus geoffroyi"};
    expect(applyTaxonomy(first, other).fields.description).toContain("Leopardus geoffroyi");
    first.fields.description = "Elle yazılmış gözlem notu.";
    expect(applyTaxonomy(first, other).fields.description).toBe("Elle yazılmış gözlem notu.");
  });
  it("builds an importable archive with exact photo names and real zero coordinates", async () => {
    const first = newWorkshopGroup(["a", "b"]), second = newWorkshopGroup(["c"]);
    for (const group of [first, second]) group.fields = {...group.fields, lat: "0", lng: "38,5", username: "source-user"};
    const photos: WorkshopPhoto[] = ["a", "b", "c"].map(id => ({id, name: id + ".jpg", file: new File([id], id + ".webp", {type: "image/webp"}), preview: "blob:" + id}));
    const archive = buildWorkshopArchive([first, second], photos);
    expect(archive.dataset.posts.map(post => post.images)).toEqual([["./photos/gonderi1.1.webp", "./photos/gonderi1.2.webp"], ["./photos/gonderi2.1.webp"]]);
    expect(await (await archive.readPhoto("./photos/gonderi1.2.webp")).text()).toBe("b");
    expect(archive.dataset.posts[0]).toMatchObject({lat: 0, lng: 38.5, author: {username: "source-user"}});
    first.fields.lat = "";
    expect(() => buildWorkshopArchive([first], photos)).toThrow("konum");
  });
});
