import { writeFile, mkdir } from "fs/promises";
import path from "path";

const MAX_AVATAR_BYTES = 10 * 1024 * 1024; // 10MB — guards the upload itself; the
// client always sends a 128x128 canvas-resized PNG, so the actual bytes are far
// smaller in practice, but a client that bypasses our own UI could send more.
const AVATAR_DIR = path.join(process.cwd(), "public", "uploads", "avatars");
const DATA_URL_PATTERN = /^data:image\/png;base64,(.+)$/;

/**
 * Validates and writes a client-supplied avatar image, overwriting any previous
 * one for this user. Only accepts image/png — the client's canvas resize always
 * produces PNG (see ProfileContent.tsx), so anything else either bypassed our own
 * UI or is a corrupted upload; reject rather than guess at the real format.
 */
export async function saveAvatar(userId: string, dataUrl: string): Promise<string> {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }
  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw new Error("파일 크기는 10MB 이하여야 합니다.");
  }
  await mkdir(AVATAR_DIR, { recursive: true });
  await writeFile(path.join(AVATAR_DIR, `${userId}.png`), buffer);
  return `/uploads/avatars/${userId}.png`;
}
