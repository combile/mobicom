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
 * File uploads for documents (발표 자료 등).
 *
 * Same streaming-to-disk approach as chat attachments (mobion-uploads.ts) —
 * bytes never sit in the process's memory, and no size cap, for the same
 * reason: the only people uploading are this lab's own members.
 */

// Streaming needs the node runtime; the edge runtime would buffer the body.
export const runtime = "nodejs";
export const maxDuration = 3600;

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const filename = String(url.searchParams.get("filename") ?? "").slice(0, 255);
    // Optional: set when attaching to a document that already exists (editing
    // one). Left out when composing a brand-new document — it has no id yet,
    // so the upload is linked afterward via PATCH once one is assigned.
    const documentId = url.searchParams.get("documentId");

    if (!filename) {
      return NextResponse.json({ error: "파일 이름이 필요합니다." }, { status: 400 });
    }
    if (!request.body) {
      return NextResponse.json({ error: "파일 내용이 비어 있습니다." }, { status: 400 });
    }

    if (documentId) {
      const doc = await query<{ archived_at: string | null }>(
        `SELECT archived_at FROM mobion_documents WHERE id = $1`,
        [documentId],
      );
      if (doc.rows.length === 0) {
        return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
      }
      if (doc.rows[0].archived_at) {
        return NextResponse.json(
          { error: "보관된 문서에는 파일을 첨부할 수 없습니다." },
          { status: 409 },
        );
      }
    }

    const dir = await uploadDir();
    await mkdir(dir, { recursive: true });

    // The stored name is a fresh uuid, never the uploaded one — see the same
    // note on the chat attachments route this mirrors.
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
    const expiresAt = expiryFor(written);

    const inserted = await query<{ id: string; expires_at: string | null }>(
      `INSERT INTO mobion_document_attachments
         (id, document_id, filename, mime, size, storage_path, uploaded_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, expires_at`,
      [id, documentId ?? null, filename, mime, written, storagePath, user.id, expiresAt],
    );

    // Not awaited: this person's upload should not wait on someone else's old
    // files being unlinked.
    void sweepExpired(query, "mobion_document_attachments").catch(() => {});

    return NextResponse.json({
      attachment: {
        id: inserted.rows[0].id,
        filename,
        mime,
        size: written,
        expiresAt: inserted.rows[0].expires_at,
        url: `/api/mobion/documents/attachments/${inserted.rows[0].id}`,
      },
    });
  } catch (error) {
    return mobionApiError(error, "파일을 올리지 못했습니다.");
  }
}

/**
 * Attaches already-uploaded files to a document, once the document exists.
 *
 * Needed for the "still composing a new document" case — upload happens
 * before the document is saved, so the two are joined in this second step.
 * (Uploading straight into an existing document passes `documentId` on POST
 * instead and skips this.)
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const documentId = String(body.documentId ?? "");
    const ids: string[] = Array.isArray(body.attachmentIds)
      ? body.attachmentIds.map(String).slice(0, 20)
      : [];

    if (!documentId || ids.length === 0) {
      return NextResponse.json({ error: "문서와 파일이 필요합니다." }, { status: 400 });
    }

    const doc = await query<{ archived_at: string | null }>(
      `SELECT archived_at FROM mobion_documents WHERE id = $1`,
      [documentId],
    );
    if (doc.rows.length === 0) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }
    if (doc.rows[0].archived_at) {
      return NextResponse.json(
        { error: "보관된 문서에는 파일을 첨부할 수 없습니다." },
        { status: 409 },
      );
    }

    // Only the uploader's own not-yet-attached rows can be claimed, so a
    // guessed id cannot pull someone else's file into a document.
    const result = await query(
      `UPDATE mobion_document_attachments
          SET document_id = $1
        WHERE id = ANY($2::uuid[]) AND uploaded_by = $3 AND document_id IS NULL`,
      [documentId, ids, user.id],
    );

    return NextResponse.json({ ok: true, attached: result.rowCount });
  } catch (error) {
    return mobionApiError(error, "파일을 문서에 붙이지 못했습니다.");
  }
}
