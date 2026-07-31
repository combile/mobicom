import { cookies } from "next/headers";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { query } from "./mobion-db";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "mobion_session";
const SESSION_DAYS = 14;

export type MobionUser = {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
};

type UserRow = MobionUser & {
  password_hash: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO mobion_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await query(`DELETE FROM mobion_sessions WHERE token_hash = $1`, [
      sha256(token),
    ]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<MobionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await query<MobionUser>(
    `SELECT u.id, u.name, u.email, u.is_admin
     FROM mobion_sessions s
     JOIN mobion_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()
     LIMIT 1`,
    [sha256(token)],
  );

  return result.rows[0] ?? null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function findUserByEmail(email: string) {
  const result = await query<UserRow>(
    `SELECT id, name, email, password_hash
     FROM mobion_users
     WHERE email = $1
     LIMIT 1`,
    [email.toLowerCase()],
  );

  return result.rows[0] ?? null;
}
