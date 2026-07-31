import { createHash, randomBytes } from "crypto";
import { query } from "./mobion-db";

const INVITE_DAYS = 7;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createInvite(email: string, invitedBy: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO mobion_invites (email, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [email.toLowerCase(), sha256(token), invitedBy, expiresAt],
  );

  return { token, expiresAt };
}

export async function findValidInvite(token: string) {
  const result = await query<{ id: string; email: string }>(
    `SELECT id, email
     FROM mobion_invites
     WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL
     LIMIT 1`,
    [sha256(token)],
  );
  return result.rows[0] ?? null;
}

export async function consumeInvite(inviteId: string) {
  await query(`UPDATE mobion_invites SET used_at = now() WHERE id = $1`, [
    inviteId,
  ]);
}
