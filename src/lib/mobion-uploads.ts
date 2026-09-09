import { join } from "path";
import { homedir } from "os";

/**
 * Where uploaded chat files are kept.
 *
 * Outside the app directory on purpose: a deploy wipes and rebuilds `.next`,
 * and anything stored under it would go with it. Overridable so the store can
 * be moved to a bigger disk without touching code or the database — only this
 * env var and the files themselves move, since `storage_path` rows are stored
 * relative to whatever this returns.
 */
export async function uploadDir(): Promise<string> {
  return process.env.MOBION_UPLOAD_DIR ?? join(homedir(), "mobicom-uploads");
}

/**
 * Retention: small files are kept forever, large ones expire.
 *
 * Screenshots, PDFs and documents — what people actually go looking for months
 * later — sit well under the threshold and are never deleted. The cap exists
 * for datasets and video, which are usually handed over once and then dead
 * weight on a disk shared with Postgres and every Huly container.
 *
 * 30 days rather than a week: the lab server has hundreds of gigabytes free, so
 * the tighter window would cost recoverable work to save space nobody needs.
 */
export const PERMANENT_MAX_BYTES = 150 * 1024 * 1024;
export const LARGE_FILE_RETENTION_DAYS = 30;

/** When a file of this size should be deleted, or null to keep it forever. */
export function expiryFor(size: number): Date | null {
  if (size <= PERMANENT_MAX_BYTES) return null;
  return new Date(Date.now() + LARGE_FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Deletes the bytes of files whose retention window has passed.
 *
 * Called from the upload route rather than from a cron job: disk only grows
 * when something is uploaded, so sweeping at that moment keeps the two in step
 * and leaves nothing to install or monitor on the server. The row is kept with
 * its storage_path cleared, so the message still shows that a file was here.
 *
 * ponytail: sweep-on-upload, no scheduler. If the lab ever goes months without
 * an upload while expired files sit on disk, add a cron hitting this.
 */
export async function sweepExpired(
  query: <T extends { storage_path: string }>(
    text: string,
    params: unknown[],
  ) => Promise<{ rows: T[] }>,
): Promise<number> {
  const { join } = await import("path");
  const { unlink } = await import("fs/promises");

  const expired = await query<{ storage_path: string }>(
    `UPDATE mobion_attachments
        SET storage_path = ''
      WHERE expires_at IS NOT NULL AND expires_at <= now() AND storage_path <> ''
      RETURNING storage_path`,
    [],
  );

  const dir = await uploadDir();
  let removed = 0;
  for (const row of expired.rows) {
    // Already-missing files are fine — the row is what decides whether a file
    // counts as gone, and a failed unlink must not stop the rest of the sweep.
    await unlink(join(dir, row.storage_path))
      .then(() => {
        removed += 1;
      })
      .catch(() => {});
  }
  return removed;
}
