import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { asc, eq, lte, sql, like, or } from "drizzle-orm";
import { cloudImageDeletions, postImages, users } from "../../db/schema";
import { getDb } from "../queries/connection";
import { destroyCloudImage, isCloudinaryImageUrl, cloudPublicId, requireCloudinary, cloudinaryConfigured } from "./cloudImages";
import { log } from "./logger";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
let prepared: Promise<void> | undefined;
let running: Promise<void> | undefined;

// The queue lives with the observation database, so Render restarts retain failed deletions.
export async function prepareImageCleanup(): Promise<void> {
  if (!prepared) {
    prepared = getDb().execute(sql`CREATE TABLE IF NOT EXISTS cloud_image_deletions (
      id varchar(64) NOT NULL PRIMARY KEY,
      file_key varchar(512) NOT NULL,
      attempts int unsigned NOT NULL DEFAULT 0,
      next_attempt_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_error varchar(500),
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX cloud_deletion_due_idx (next_attempt_at)
    ) ENGINE=InnoDB`).then(() => undefined).catch(error => {
      prepared = undefined;
      throw error;
    });
  }
  await prepared;
}

// Call inside the same transaction that removes the final site reference.
export async function queueCloudImages(tx: Transaction, urls: (string | null | undefined)[]) {
  for (const url of new Set(urls)) {
    if (!url || !isCloudinaryImageUrl(url)) continue;
    try { requireCloudinary(); } catch (error) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Cloudinary ayarları eksik." }); }
    const id = createHash("sha256").update(cloudPublicId(url) || url).digest("hex");
    await tx.insert(cloudImageDeletions).values({ id, fileKey: url }).onDuplicateKeyUpdate({ set: { id } });
  }
}

async function processBatch() {
  await prepareImageCleanup();
  for (let index = 0; index < 12; index++) {
    const handled = await getDb().transaction(async tx => {
      const [job] = await tx.select().from(cloudImageDeletions)
        .where(lte(cloudImageDeletions.nextAttemptAt, new Date()))
        .orderBy(asc(cloudImageDeletions.nextAttemptAt), asc(cloudImageDeletions.id))
        .limit(1).for("update");
      if (!job) return false;
      const publicId = cloudPublicId(job.fileKey);
      const tail = publicId?.split("/").at(-1) || "";
      const pattern = "%/" + tail + "%";
      const encodedPattern = "%/" + encodeURIComponent(tail) + "%";
      const images = await tx.select({ url: postImages.fileKey }).from(postImages).where(or(like(postImages.fileKey, pattern), like(postImages.fileKey, encodedPattern)));
      const avatars = await tx.select({ url: users.avatarKey }).from(users).where(or(like(users.avatarKey, pattern), like(users.avatarKey, encodedPattern)));
      if (publicId && [...images, ...avatars].some(row => row.url && cloudPublicId(row.url) === publicId)) {
        await tx.delete(cloudImageDeletions).where(eq(cloudImageDeletions.id, job.id));
        return true;
      }
      try {
        await destroyCloudImage(job.fileKey);
        await tx.delete(cloudImageDeletions).where(eq(cloudImageDeletions.id, job.id));
      } catch (error) {
        const attempts = job.attempts + 1;
        const delay = Math.min(6 * 60 * 60, 30 * 2 ** Math.min(attempts - 1, 10));
        const message = error instanceof Error ? error.message : "Bulut silme işlemi başarısız.";
        await tx.update(cloudImageDeletions).set({
          attempts, nextAttemptAt: new Date(Date.now() + delay * 1000), lastError: message.slice(0, 500),
        }).where(eq(cloudImageDeletions.id, job.id));
        log.warn("Cloudinary deletion queued for retry", { id: job.id, attempts, error: message });
      }
      return true;
    });
    if (!handled) break;
  }
}

export function kickCloudImageCleanup() {
  if (running) return running;
  running = processBatch().catch(error => {
    log.error("Cloud image cleanup failed", { error: error instanceof Error ? error.message : String(error) });
  }).finally(() => { running = undefined; });
  return running;
}

export function startCloudImageCleanup() {
  // Missing credentials can give old site deletions a long retry delay. A restarted
  // server with restored credentials can resume exactly those recorded deletions.
  void (async () => {
    await prepareImageCleanup();
    if (cloudinaryConfigured()) await getDb().update(cloudImageDeletions).set({nextAttemptAt: new Date()}).where(or(
      eq(cloudImageDeletions.lastError, "Cloudinary silme ayarları eksik."),
      like(cloudImageDeletions.lastError, "Cloudinary silme/yükleme anahtarları sunucuda eksik.%"),
    ));
    await kickCloudImageCleanup();
  })().catch(error => log.error("Cloud image cleanup startup failed", {error: error instanceof Error ? error.message : String(error)}));
  const timer = setInterval(kickCloudImageCleanup, 30_000);
  timer.unref();
}
