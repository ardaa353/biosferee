import {afterEach, describe, expect, it, vi} from "vitest";
import {runDatasetImport, type ImportSession} from "./datasetImport";
import {buildWorkshopArchive, newWorkshopGroup} from "./workshop";
vi.mock("./photos", () => ({preparePhoto: async (file: File) => file}));
afterEach(() => vi.unstubAllGlobals());
describe("direct workshop save", () => {
  it("resumes after a failed commit without reuploading photos or duplicating completed records", async () => {
    const groups = [newWorkshopGroup(["a"]), newWorkshopGroup(["b"])];
    for (const group of groups) { group.fields.lat = "40"; group.fields.lng = "38"; }
    const archive = buildWorkshopArchive(groups, ["a", "b"].map(id => ({id, name: id, preview: "", file: new File([id], id + ".webp", {type: "image/webp"})})));
    const committed = new Set<string>(); let failOnce = true;
    const rpc = {
      begin: vi.fn(async () => ({id: "job-1"})),
      prepare: vi.fn(async ({record}: {record: {id: string}}) => ({id: record.id, postId: committed.has(record.id) ? Number(record.id) : null, uploads: [{url: "https://cloud.example/upload", fields: {public_id: record.id}}]})),
      commit: vi.fn(async ({entryId}: {entryId: string}) => { if (entryId === "2" && failOnce) { failOnce = false; throw new Error("connection lost"); } committed.add(entryId); }),
      finish: vi.fn(async () => {}),
    };
    const upload = vi.fn(async () => new Response(JSON.stringify({secure_url: "https://cloud.example/photo.webp"})));
    vi.stubGlobal("fetch", upload);
    const session: ImportSession = {jobId: null, uploads: new Map()};
    await expect(runDatasetImport(archive, null, rpc, session, new AbortController().signal, () => {})).rejects.toThrow("connection lost");
    expect(session.jobId).toBe("job-1"); expect(committed.has("1")).toBe(true);
    await runDatasetImport(archive, null, rpc, session, new AbortController().signal, () => {});
    expect(rpc.begin).toHaveBeenCalledTimes(1); expect(upload).toHaveBeenCalledTimes(2);
    expect([...committed]).toEqual(["1", "2"]); expect(rpc.finish).toHaveBeenCalledTimes(1);
    expect(session.jobId).toBeNull();
  });
});
