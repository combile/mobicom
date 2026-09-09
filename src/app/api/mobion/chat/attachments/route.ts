import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";
import { uploadDir, expiryFor, sweepExpired } from "@/lib/mobion-uploads";

/**
 * File uploads for chat.
 *
 * The bytes are streamed to the lab server's disk and only their metadata goes
 * to Postgres. Two reasons: a large file in a bytea column is loaded into memory
 * by any query that selects the row, and the request body is piped straight to
 * disk here so a big upload never has to sit in the process's heap either.
 *
 * There is deliberately no size cap — the lab server is the only thing serving
 * these files, and the people uploading are the same handful who own it.
 */

// Streaming needs the node runtime; the edge runtime would buffer the body.
export const runtime = "nodejs";
export const maxDuration = 3600;

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const channelId = String(url.searchParams.get("channelId") ?? "");
    const filename = String(url.searchParams.get("filename") ?? "").slice(0, 255);

    if (!channelId || !filename) {
      return NextResponse.json({ error: "채널과 파일 이름이 필요합니다." }, { status: 400 });
    }
    if (!request.body) {
      return NextResponse.json({ error: "파일 내용이 비어 있습니다." }, { status: 400 });
    }

    const dir = await uploadDir();
    await mkdir(dir, { recursive: true });

    // The stored name is a fresh uuid, never the uploaded one: two people
    // uploading "screenshot.png" must not collide, and a name arriving from a
    // browser must never be able to steer the write (../../ and friends). The
    // original name is kept in the database for display only.
    const id = randomUUID();
    const storagePath = `${id}.bin`;
    const target = join(dir, storagePath);

    let written = 0;
    const source = Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]);
    source.on("data", (chunk: Buffer) => {
      written += chunk.length;
    });
    await pipeline(source, createWriteStream(target));

    const mime = request.headers.get("content-type") ?? "application/octet-stream";

    // Size is only known once the stream has finished, which is why retention
    // is decided here rather than from a Content-Length the client could lie
    // about (or omit entirely on a chunked upload).
    const expiresAt = expiryFor(written);

    const inserted = await query<{ id: string; expires_at: string | null }>(
      `INSERT INTO mobion_attachments
         (id, message_id, filename, mime, size, storage_path, uploaded_by, channel_id, expires_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, expires_at`,
      [id, filename, mime, written, storagePath, user.id, channelId, expiresAt],
    );

    // Not awaited: the person uploading should not wait on someone else's old
    // files being unlinked, and a failed sweep must not fail their upload.
    void sweepExpired(query).catch(() => {});

    return NextResponse.json({
      attachment: {
        id: inserted.rows[0].id,
        filename,
        mime,
        size: written,
        expiresAt: inserted.rows[0].expires_at,
        url: `/api/mobion/chat/attachments/${inserted.rows[0].id}`,
      },
    });
  } catch (error) {
    return mobionApiError(error, "파일을 올리지 못했습니다.");
  }
}

/**
 * Attaches already-uploaded files to a message, once the message exists.
 *
 * Upload happens before send (so a slow upload does not block typing) and the
 * message id only exists afterwards, so the two are joined in this second step.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const messageId = String(body.messageId ?? "");
    const ids: string[] = Array.isArray(body.attachmentIds)
      ? body.attachmentIds.map(String).slice(0, 20)
      : [];

    if (!messageId || ids.length === 0) {
      return NextResponse.json({ error: "메시지와 파일이 필요합니다." }, { status: 400 });
    }

    // Only the uploader's own not-yet-attached rows can be claimed, so a
    // guessed id cannot pull someone else's file into a message.
    const result = await query(
      `UPDATE mobion_attachments
          SET message_id = $1
        WHERE id = ANY($2::uuid[]) AND uploaded_by = $3 AND message_id IS NULL`,
      [messageId, ids, user.id],
    );

    return NextResponse.json({ ok: true, attached: result.rowCount });
  } catch (error) {
    return mobionApiError(error, "파일을 메시지에 붙이지 못했습니다.");
  }
}

/** Attachment metadata for a set of messages, in one query. */
export async function GET(request: Request) {
  try {
    await requireCurrentUser();
    const url = new URL(request.url);
    const ids = (url.searchParams.get("messageIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);

    if (ids.length === 0) return NextResponse.json({ attachments: {} });

    const rows = await query<{
      id: string;
      message_id: string;
      filename: string;
      mime: string;
      size: string;
      expires_at: string | null;
      expired: boolean;
    }>(
      `SELECT id, message_id, filename, mime, size::text, expires_at,
              (expires_at IS NOT NULL AND expires_at <= now()) AS expired
         FROM mobion_attachments
        WHERE message_id = ANY($1::text[])
        ORDER BY created_at`,
      [ids],
    );

    const byMessage: Record<
      string,
      {
        id: string;
        filename: string;
        mime: string;
        size: number;
        expiresAt: string | null;
        expired: boolean;
        url: string;
      }[]
    > = {};
    for (const r of rows.rows) {
      // An expired row is still returned, marked: the message keeps its shape
      // and the reader sees that a file was here rather than a gap they cannot
      // interpret.
      (byMessage[r.message_id] ??= []).push({
        id: r.id,
        filename: r.filename,
        mime: r.mime,
        size: Number(r.size),
        expiresAt: r.expires_at,
        expired: r.expired,
        url: `/api/mobion/chat/attachments/${r.id}`,
      });
    }

    return NextResponse.json({ attachments: byMessage });
  } catch (error) {
    return mobionApiError(error, "첨부 파일을 불러오지 못했습니다.");
  }
}
