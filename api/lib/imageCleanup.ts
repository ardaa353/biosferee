import { createHash } from "node:crypto";
import { asc, eq, lte, sql } from "drizzle-orm";
import { cloudImageDeletions, postImages, users } from "../../db/schema";
import { getDb } from "../queries/connection";
import { destroyCloudImage, isCloudinaryImageUrl } from "./cloudImages";
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
    const id = createHash("sha256").update(url).digest("hex");
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
      // Another observation or profile may still use this exact uploaded file.
      const [image] = await tx.select({ id: postImages.id }).from(postImages).where(eq(postImages.fileKey, job.fileKey)).limit(1);
      const [avatar] = await tx.select({ id: users.id }).from(users).where(eq(users.avatarKey, job.fileKey)).limit(1);
      if (image || avatar) {
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
  if (running) return;
  running = processBatch().catch(error => {
    log.error("Cloud image cleanup failed", { error: error instanceof Error ? error.message : String(error) });
  }).finally(() => { running = undefined; });
}

export function startCloudImageCleanup() {
  kickCloudImageCleanup();
  const timer = setInterval(kickCloudImageCleanup, 30_000);
  timer.unref();
}
