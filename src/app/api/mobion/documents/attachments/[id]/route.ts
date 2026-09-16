import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat, unlink } from "fs/promises";
import { join } from "path";
import { Readable } from "stream";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";
import { uploadDir } from "@/lib/mobion-uploads";

export const runtime = "nodejs";

/**
 * Serves one uploaded document file.
 *
 * No membership check beyond being logged in — unlike chat attachments (which
 * check Huly channel membership), documents have no per-item ACL at all (see
 * the comment on mobion_documents), so any active member reading a document's
 * attachment list may also fetch the bytes behind it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;

    const rows = await query<{
      filename: string;
      mime: string;
      storage_path: string;
      expired: boolean;
    }>(
      `SELECT filename, mime, storage_path,
              (expires_at IS NOT NULL AND expires_at <= now()) AS expired
         FROM mobion_document_attachments WHERE id = $1`,
      [id],
    );
    const file = rows.rows[0];
    if (!file) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }
    if (file.expired) {
      return NextResponse.json(
        { error: "보관 기간이 지나 삭제된 파일입니다." },
        { status: 410 },
      );
    }

    const path = join(await uploadDir(), file.storage_path);
    const info = await stat(path).catch(() => null);
    if (!info) {
      return NextResponse.json({ error: "파일이 서버에 없습니다." }, { status: 410 });
    }

    // Streamed rather than read into a Buffer: a large slide deck must not be
    // held in the process's memory to be sent.
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(info.size),
        // inline so images and PDFs preview in the browser; the filename is
        // percent-encoded because it is user-supplied text that would
        // otherwise be able to inject header syntax.
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return mobionApiError(error, "파일을 내려받지 못했습니다.");
  }
}

/**
 * Removes an attachment — a deliberate action, so unlike expiry (which only
 * clears storage_path and keeps the row as a record), this deletes the row
 * and the file outright.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;

    const rows = await query<{ storage_path: string; archived_at: string | null }>(
      `SELECT a.storage_path, d.archived_at
         FROM mobion_document_attachments a
         LEFT JOIN mobion_documents d ON d.id = a.document_id
        WHERE a.id = $1`,
      [id],
    );
    const file = rows.rows[0];
    if (!file) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }
    if (file.archived_at) {
      return NextResponse.json(
        { error: "보관된 문서의 파일은 삭제할 수 없습니다." },
        { status: 409 },
      );
    }

    await query(`DELETE FROM mobion_document_attachments WHERE id = $1`, [id]);

    if (file.storage_path) {
      await unlink(join(await uploadDir(), file.storage_path)).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "파일을 삭제하지 못했습니다.");
  }
}
