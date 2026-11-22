import { t as trText } from "@/lib/i18n";
import { isVideoFile, uploadVideo } from "./media";
import type { PortablePost } from "@contracts/dataset";
import type { DatasetArchive } from "./datasetArchive";
import { preparePhoto } from "./photos";
type ImportRpc = {
  begin: (input: {
    archiveId: string;
    total: number;
    authorId: number | null;
  }) => Promise<{
    id: string;
  }>;
  prepare: (input: { jobId: string; record: PortablePost }) => Promise<{
    id: string;
    postId: number | null;
    uploads: {
      url: string;
      fields: Record<string, string>;
    }[];
  }>;
  commit: (input: {
    jobId: string;
    entryId: string;
    images: string[];
  }) => Promise<unknown>;
  finish: (input: { id: string; cancel?: boolean }) => Promise<unknown>;
};
export type ImportSession = {
  jobId: string | null;
  uploads: Map<string, string>;
};
export async function runDatasetImport(
  archive: DatasetArchive,
  authorId: number | null,
  rpc: ImportRpc,
  session: ImportSession,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  if (!session.jobId)
    session.jobId = (
      await rpc.begin({
        archiveId: archive.dataset.archiveId,
        total: archive.dataset.posts.length,
        authorId,
      })
    ).id;
  const jobId = session.jobId;
  for (const [number, record] of archive.dataset.posts.entries()) {
    signal.throwIfAborted();
    progress(
      trText("Gönderi {0} / {1} işleniyor…", [
        number + 1,
        archive.dataset.posts.length,
      ]),
    );
    const entry = await rpc.prepare({ jobId, record });
    if (entry.postId) continue;
    const images: string[] = [];
    for (const [index, path] of record.images.entries()) {
      signal.throwIfAborted();
      const key = entry.id + ":" + index,
        previous = session.uploads.get(key);
      if (previous) {
        images.push(previous);
        continue;
      }
      progress(
        trText("Gönderi {0} · fotoğraf {1} / {2} yükleniyor…", [
          number + 1,
          index + 1,
          record.images.length,
        ]),
      );
      const source = await archive.readPhoto(path);
      const signed = entry.uploads[index];
      if (isVideoFile(source)) {
        const uploaded = await uploadVideo(source, signed, progress, signal);
        session.uploads.set(key, uploaded.contentBase64);
        images.push(uploaded.contentBase64);
        continue;
      }
      const photo = await preparePhoto(source);
      signal.throwIfAborted();
      const body = new FormData();
      for (const [key, value] of Object.entries(signed.fields))
        body.append(key, value);
      body.append("file", photo);
      const response = await fetch(signed.url, {
        method: "POST",
        body,
        signal,
      });
      const data = await response.json();
      if (!response.ok || typeof data.secure_url !== "string")
        throw new Error(data.error?.message || trText("Fotoğraf yüklenemedi."));
      session.uploads.set(key, data.secure_url);
      images.push(data.secure_url);
    }
    signal.throwIfAborted();
    await rpc.commit({ jobId, entryId: entry.id, images });
  }
  signal.throwIfAborted();
  await rpc.finish({ id: jobId });
  session.jobId = null;
  session.uploads.clear();
}
