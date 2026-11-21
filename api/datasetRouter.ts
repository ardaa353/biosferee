import { randomUUID, createHash } from "node:crypto";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { posts, users, postImages, likes, collaborators, suggestions, reports, importedObservationData, datasetImportJobs, datasetImportEntries, cloudImageDeletions } from "../db/schema";
import { DATASET_FORMAT, DATASET_VERSION, portablePostSchema } from "../contracts/dataset";
import { cloudAssetUrl, cloudPublicId, cloudName, cloudinaryConfigured, deleteExistingBackup, deletedCloudImageUrls, probeCloudinary, requireCloudinary, signedImageUpload } from "./lib/cloudImages";
import { prepareImageCleanup, queueCloudImages, kickCloudImageCleanup } from "./lib/imageCleanup";

const owner = authedQuery.use(({ctx, next}) => {
  if (ctx.user.role !== "admin") throw new TRPCError({code: "FORBIDDEN", message: "Veri aktarımı yalnızca admin hesabına açıktır."});
  return next({ctx});
});
let schemaReady: Promise<void> | undefined;
export async function prepareDatasetSchema() {
  if (!schemaReady) schemaReady = (async () => {
    const db = getDb();
    const [columns] = await db.execute(sql.raw("SHOW COLUMNS FROM posts LIKE 'author_id'")) as unknown as [{Null: string}[], unknown];
    if (columns[0]?.Null === "NO") await db.execute(sql.raw("ALTER TABLE posts MODIFY COLUMN author_id bigint unsigned NULL"));
    await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS dataset_import_jobs (id varchar(36) PRIMARY KEY, importer_id bigint unsigned NOT NULL, author_id bigint unsigned NULL, archive_id varchar(128) NOT NULL, total int unsigned NOT NULL, state varchar(20) NOT NULL DEFAULT 'active', created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB"));
    await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS dataset_import_entries (id varchar(64) PRIMARY KEY, job_id varchar(36) NOT NULL, source_id varchar(128) NOT NULL, post_id bigint unsigned NULL, `record` JSON NOT NULL, public_ids JSON NOT NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX dataset_entry_job_idx(job_id)) ENGINE=InnoDB"));
    await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS imported_observation_data (post_id bigint unsigned PRIMARY KEY, source JSON NOT NULL) ENGINE=InnoDB"));
    await prepareImageCleanup();
  })().catch(error => { schemaReady = undefined; throw error; });
  await schemaReady;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
async function lockedJob(tx: Transaction, id: string, importerId: number, active = true) {
  const [job] = await tx.select().from(datasetImportJobs).where(eq(datasetImportJobs.id, id)).limit(1).for("update");
  if (!job || job.importerId !== importerId) throw new TRPCError({code: "NOT_FOUND", message: "Aktarım bulunamadı."});
  if (active && job.state !== "active") throw new TRPCError({code: "BAD_REQUEST", message: "Bu aktarım kapanmış. Yeni aktarım başlatın."});
  return job;
}
async function discardUnfinishedJob(id: string) {
  await getDb().transaction(async tx => {
    const [job] = await tx.select().from(datasetImportJobs).where(eq(datasetImportJobs.id, id)).limit(1).for("update");
    if (!job || job.state === "cleaned" || job.state === "complete") return;
    // Upload signatures expire after one hour. Wait two hours before deleting abandoned reservations.
    if (job.updatedAt.getTime() > Date.now() - 2 * 60 * 60 * 1000) return;
    const unfinished = await tx.select().from(datasetImportEntries).where(and(eq(datasetImportEntries.jobId, id), isNull(datasetImportEntries.postId)));
    for (const entry of unfinished) await queueCloudImages(tx, entry.publicIds.map(cloudAssetUrl));
    await tx.update(datasetImportJobs).set({state: "cleaned"}).where(eq(datasetImportJobs.id, id));
  });
  kickCloudImageCleanup();
}
export function startAbandonedImportCleanup() {
  const timer = setInterval(() => {
    if (!cloudinaryConfigured()) return;
    void (async () => {
      await prepareDatasetSchema();
      const jobs = await getDb().select({id: datasetImportJobs.id}).from(datasetImportJobs)
        .where(and(lt(datasetImportJobs.updatedAt, new Date(Date.now() - 2 * 60 * 60 * 1000)), sql`${datasetImportJobs.state} in ('active','cancelled')`)).limit(5);
      for (const job of jobs) await discardUnfinishedJob(job.id);
    })().catch(error => console.error("Yarım kalan aktarım temizliği:", error instanceof Error ? error.message : "Başarısız"));
  }, 60_000);
  timer.unref();
}
export const datasetRouter = createRouter({
  export: owner.query(async () => {
    await prepareDatasetSchema();
    return getDb().transaction(async tx => {
      const [records, images, accounts, votes, partners, identifications, flags, imported] = await Promise.all([
        tx.select().from(posts).orderBy(posts.id), tx.select().from(postImages).orderBy(postImages.sortOrder, postImages.id),
        tx.select({id: users.id, username: users.username, firstName: users.firstName, lastName: users.lastName, bio: users.bio, role: users.role}).from(users),
        tx.select().from(likes), tx.select().from(collaborators), tx.select().from(suggestions), tx.select().from(reports), tx.select().from(importedObservationData),
      ]);
      const accountMap = new Map(accounts.map(user => [user.id, user]));
      const sourceMap = new Map(imported.map(row => [row.postId, row.source]));
      const group = <T,>(items: T[], key: (value: T) => number) => {
        const result = new Map<number, T[]>();
        for (const item of items) { const id = key(item); const rows = result.get(id) || []; rows.push(item); result.set(id, rows); }
        return result;
      };
      const imageMap = group(images, image => image.postId), voteMap = group(votes, vote => vote.postId);
      const partnerMap = group(partners, partner => partner.postId), identificationMap = group(identifications, row => row.postId), flagMap = group(flags, flag => flag.postId);
      return {
        format: DATASET_FORMAT, version: DATASET_VERSION, archiveId: randomUUID(), exportedAt: new Date().toISOString(),
        users: accounts.map(({id: _id, ...account}) => account),
        posts: records.map(post => {
          const author = post.authorId === null ? undefined : accountMap.get(post.authorId);
          const {id, authorId: _authorId, createdAt, updatedAt, ...fields} = post;
          return {...fields, id: String(id), createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
            kingdom: post.kingdom || "", phylum: post.phylum || "", className: post.className || "", orderName: post.orderName || "",
            family: post.family || "", genus: post.genus || "", species: post.species || "", commonName: post.commonName || "",
            author: author ? {username: author.username, firstName: author.firstName, lastName: author.lastName, system: false} : {username: "", firstName: "BioSfere", lastName: "", system: true},
            images: (imageMap.get(id) || []).map(image => ({url: image.fileKey, id: image.id})),
            metadata: {
              ...sourceMap.get(id),
              collaborators: (partnerMap.get(id) || []).map(row => accountMap.get(row.userId)?.username).filter(Boolean),
              reactions: (voteMap.get(id) || []).map(row => ({username: accountMap.get(row.userId)?.username || "", createdAt: row.createdAt.toISOString()})),
              identifications: (identificationMap.get(id) || []).map(({userId, ...row}) => ({...row, username: accountMap.get(userId)?.username || ""})),
              reports: (flagMap.get(id) || []).map(({reporterId, ...row}) => ({...row, username: accountMap.get(reporterId)?.username || ""})),
            },
          };
        }),
      };
    });
  }),
  begin: owner.input(z.object({archiveId: z.string().min(1).max(128), total: z.number().int().nonnegative(), authorId: z.number().int().positive().nullable()})).mutation(async ({ctx, input}) => {
    requireCloudinary(); await probeCloudinary(); await prepareDatasetSchema();
    if (input.authorId !== null) {
      const [user] = await getDb().select({id: users.id}).from(users).where(eq(users.id, input.authorId)).limit(1);
      if (!user) throw new TRPCError({code: "BAD_REQUEST", message: "Gönderen kullanıcı bulunamadı."});
    }
    const id = randomUUID();
    await getDb().insert(datasetImportJobs).values({id, importerId: ctx.user.id, ...input});
    return {id};
  }),
  prepareEntry: owner.input(z.object({jobId: z.string().uuid(), record: portablePostSchema})).mutation(async ({ctx, input}) => {
    await prepareDatasetSchema(); requireCloudinary();
    const id = createHash("sha256").update(input.jobId + "\0" + input.record.id).digest("hex");
    const entry = await getDb().transaction(async tx => {
      await lockedJob(tx, input.jobId, ctx.user.id);
      const [old] = await tx.select().from(datasetImportEntries).where(eq(datasetImportEntries.id, id)).limit(1);
      if (old) {
        if (canonical(old.record) !== canonical(input.record)) throw new TRPCError({code: "CONFLICT", message: "Arşiv kaydı aktarım sırasında değişti. Yeni aktarım başlatın."});
        return old;
      }
      const publicIds = input.record.images.map((_, index) => "biosfere/imports/" + input.jobId + "/" + id + "-" + (index + 1));
      const row = {id, jobId: input.jobId, sourceId: input.record.id, record: input.record, publicIds, postId: null};
      await tx.insert(datasetImportEntries).values(row);
      await tx.update(datasetImportJobs).set({updatedAt: new Date()}).where(eq(datasetImportJobs.id, input.jobId));
      return row;
    });
    return {id: entry.id, postId: entry.postId, uploads: entry.postId ? [] : entry.publicIds.map(publicId => signedImageUpload(publicId))};
  }),
  commitEntry: owner.input(z.object({jobId: z.string().uuid(), entryId: z.string().length(64), images: z.array(z.string().url().max(512))})).mutation(async ({ctx, input}) => {
    await prepareDatasetSchema();
    return getDb().transaction(async tx => {
      const job = await lockedJob(tx, input.jobId, ctx.user.id);
      const [entry] = await tx.select().from(datasetImportEntries).where(and(eq(datasetImportEntries.id, input.entryId), eq(datasetImportEntries.jobId, job.id))).limit(1).for("update");
      if (!entry) throw new TRPCError({code: "NOT_FOUND", message: "Aktarım kaydı bulunamadı."});
      if (entry.postId) return {id: entry.postId};
      if (input.images.length !== entry.publicIds.length || input.images.some((url, index) => cloudPublicId(url) !== entry.publicIds[index])) throw new TRPCError({code: "BAD_REQUEST", message: "Fotoğraf ve gönderi eşlemesi uyuşmuyor."});
      if (job.authorId !== null) {
        const [author] = await tx.select({id: users.id}).from(users).where(eq(users.id, job.authorId)).limit(1).for("update");
        if (!author) throw new TRPCError({code: "BAD_REQUEST", message: "Seçilen kullanıcı artık mevcut değil."});
      }
      const r = entry.record;
      const [{id}] = await tx.insert(posts).values({authorId: job.authorId, description: r.description || "Arşivden aktarılan canlı gözlemi.",
        status: r.status === "removed" ? "removed" : r.species ? r.status : "unknown",
        kingdom: r.kingdom, phylum: r.phylum, className: r.className, orderName: r.orderName, family: r.family, genus: r.genus, species: r.species, commonName: r.commonName,
        city: r.city || "Belirtilmedi", locality: r.locality || "Belirtilmedi", lat: r.lat, lng: r.lng,
        ...(r.createdAt ? {createdAt: new Date(r.createdAt)} : {}), ...(r.updatedAt ? {updatedAt: new Date(r.updatedAt)} : {}),
      }).$returningId();
      for (let start = 0; start < input.images.length; start += 100) await tx.insert(postImages).values(input.images.slice(start, start + 100).map((fileKey, i) => ({postId: id, fileKey, sortOrder: start + i})));
      await tx.insert(importedObservationData).values({postId: id, source: {...r.metadata, sourceAuthor: r.author || null, sourceArchiveId: job.archiveId, sourceRecordId: r.id}});
      await tx.update(datasetImportEntries).set({postId: id}).where(eq(datasetImportEntries.id, entry.id));
      await tx.update(datasetImportJobs).set({updatedAt: new Date()}).where(eq(datasetImportJobs.id, job.id));
      return {id};
    });
  }),
  finish: owner.input(z.object({id: z.string().uuid(), cancel: z.boolean().default(false)})).mutation(async ({ctx, input}) => {
    await prepareDatasetSchema();
    return getDb().transaction(async tx => {
      const job = await lockedJob(tx, input.id, ctx.user.id, false);
      if (job.state !== "active") return {state: job.state};
      const [row] = await tx.select({total: sql<number>`count(*)`}).from(datasetImportEntries).where(and(eq(datasetImportEntries.jobId, job.id), sql`${datasetImportEntries.postId} IS NOT NULL`));
      if (!input.cancel && Number(row.total) !== job.total) throw new TRPCError({code: "BAD_REQUEST", message: "Aktarımın tamamlanmamış kayıtları var."});
      const state = input.cancel ? "cancelled" : "complete";
      await tx.update(datasetImportJobs).set({state, updatedAt: new Date()}).where(eq(datasetImportJobs.id, job.id));
      return {state};
    });
  }),
  storageHealth: owner.query(async () => {
    const configured = cloudinaryConfigured(); let error = "", pending = 0, failed = 0;
    try { await probeCloudinary(); } catch (e) { error = e instanceof Error ? e.message : "Cloudinary bağlantısı kurulamadı."; }
    try {
      await prepareImageCleanup();
      const [totals] = await getDb().select({pending: sql<number>`count(*)`, failed: sql<number>`sum(case when ${cloudImageDeletions.attempts}>0 then 1 else 0 end)`}).from(cloudImageDeletions);
      pending = Number(totals.pending); failed = Number(totals.failed || 0);
      if (!error) {
        const [last] = await getDb().select({message: cloudImageDeletions.lastError}).from(cloudImageDeletions).where(sql`${cloudImageDeletions.lastError} IS NOT NULL`).orderBy(desc(cloudImageDeletions.attempts)).limit(1);
        error = last?.message || "";
      }
    } catch (e) { error = e instanceof Error ? e.message : "Silme kuyruğu açılamadı."; }
    return {configured, connected: !error, cloudName, pending, failed, error, revision: process.env.RENDER_GIT_COMMIT?.slice(0, 12) || ""};
  }),
  retryStorage: owner.mutation(async () => {
    await probeCloudinary(); await prepareImageCleanup();
    await getDb().update(cloudImageDeletions).set({nextAttemptAt: new Date()});
    await kickCloudImageCleanup();
    return {ok: true};
  }),
  deletedBackups: owner.input(z.object({cursor: z.string().optional()})).query(async ({input}) => deletedCloudImageUrls(input.cursor)),
  cleanDeletedBackup: owner.input(z.object({url: z.string().url().max(512)})).mutation(async ({input}) => {
    await deleteExistingBackup(input.url);
    return {ok: true};
  }),
});
