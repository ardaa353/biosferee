import { afterEach, describe, expect, it, vi } from "vitest";
import { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { readFileSync } from "node:fs";
import { openDatasetArchive, exportDatasetZip } from "./datasetArchive";
import { datasetSchema } from "../../contracts/dataset";

const manifest = {format: "biosfere-dataset", version: 1, archiveId: "test-archive", posts: [{id: "1", lat: 40, lng: 38, images: ["./photos/gonderi1.1.png"]}]};
async function fixture(data: unknown = manifest, files: [string, Uint8Array][] = [["photos/gonderi1.1.png", new Uint8Array([1, 2, 3])]]) {
  const writer = new ZipWriter(new BlobWriter());
  await writer.add("data.json", new TextReader(JSON.stringify(data)));
  for (const [name, bytes] of files) await writer.add(name, new BlobReader(new Blob([new Uint8Array(bytes)])));
  return new File([await writer.close()], "fixture.zip");
}
afterEach(() => vi.unstubAllGlobals());
describe("portable observation archive", () => {
  it("matches relative photos to the correct record", async () => {
    const archive = await openDatasetArchive(await fixture());
    expect(archive.dataset.posts[0].id).toBe("1");
    expect([...new Uint8Array(await (await archive.readPhoto("./photos/gonderi1.1.png")).arrayBuffer())]).toEqual([1, 2, 3]);
    await archive.close();
  });
  it("rejects missing photos, duplicate IDs and path traversal", async () => {
    await expect(openDatasetArchive(await fixture(manifest, []))).rejects.toThrow("Fotoğraf eksik");
    await expect(openDatasetArchive(await fixture({...manifest, posts: [manifest.posts[0], manifest.posts[0]]}))).rejects.toThrow("Tekrarlanan");
    await expect(openDatasetArchive(await fixture(manifest, [["../photo.jpg", new Uint8Array()]]))).rejects.toThrow("güvenli olmayan");
    expect(datasetSchema.safeParse({...manifest, posts: [{...manifest.posts[0], images: ["./photos/../x.png"]}]}).success).toBe(false);
    expect(datasetSchema.safeParse({...manifest, posts: [{...manifest.posts[0], lat: 91}]}).success).toBe(false);
  });
  it("exports actual image files with portable names and keeps source data", async () => {
    let saved: Blob | undefined;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob([new Uint8Array([8, 9])], {type: "image/webp"}))));
    vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { saved = blob as Blob; return "blob:test"; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal("document", {createElement: () => ({click: vi.fn()})});
    await exportDatasetZip({...manifest, exportedAt: "2026-11-21", users: [{username: "source"}], posts: [{...manifest.posts[0], author: {username: "source"}, images: [{url: "https://res.cloudinary.com/example/image/upload/one.jpg"}]}]}, () => {}, new AbortController().signal);
    expect(saved).toBeDefined();
    const archive = await openDatasetArchive(new File([saved!], "export.zip"));
    expect(archive.dataset.posts[0].images).toEqual(["./photos/gonderi1.1.webp"]);
    expect(archive.dataset.posts[0].author?.username).toBe("source");
    const reader = new ZipReader(new BlobReader(saved!));
    expect((await reader.getEntries()).map(entry => entry.filename)).toEqual(["photos/gonderi1.1.webp", "data.json"]);
    await reader.close(); await archive.close();
    vi.restoreAllMocks();
  });
  it.skipIf(!process.env.BIOSFERE_ARCHIVE_FIXTURES)("reads the actual Python ZIP and stored RAR fixture", async () => {
    const root = process.env.BIOSFERE_ARCHIVE_FIXTURES!;
    const zip = await openDatasetArchive(new File([new Uint8Array(readFileSync(root + "/python-export.zip"))], "python.zip"));
    expect(zip.dataset.posts).toHaveLength(2);
    expect(zip.dataset.posts.map(post => post.images.length)).toEqual([2, 1]);
    expect(zip.dataset.posts[0].species).toBe("Bellis perennis");
    expect(zip.dataset.posts[0].lat).toBe(40.12);
    expect((await zip.readPhoto(zip.dataset.posts[0].images[0])).size).toBeGreaterThan(0);
    await zip.close();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(readFileSync("node_modules/node-unrar-js/esm/js/unrar.wasm")))));
    const rar = await openDatasetArchive(new File([new Uint8Array(readFileSync(root + "/input.rar"))], "input.rar"));
    expect(rar.dataset.posts).toHaveLength(1);
    expect((await rar.readPhoto(rar.dataset.posts[0].images[0])).size).toBeGreaterThan(0);
    await rar.close();
  });
});
