import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { join } from "path";
import { Readable } from "stream";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";
import { uploadDir } from "@/lib/mobion-uploads";
import {
  ensureHulyLink,
  getWorkspaceClient,
  CHUNTER_CLASS,
  canSeeChannel,
  findChannelForAccess,
} from "@/lib/mobion-huly";

export const runtime = "nodejs";

/**
 * Serves one uploaded file.
 *
 * The membership check is the whole point of routing downloads through the app
 * instead of serving the directory statically: an attachment id is as guessable
 * as a message id, and a file dropped in a private channel has to be as private
 * as the message it came with. Same lesson as GET /chat/messages.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    const rows = await query<{
      filename: string;
      mime: string;
      storage_path: string;
      channel_id: string;
      expired: boolean;
    }>(
      `SELECT filename, mime, storage_path, channel_id,
              (expires_at IS NOT NULL AND expires_at <= now()) AS expired
         FROM mobion_attachments WHERE id = $1`,
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

    const link = await ensureHulyLink(user);
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }
    const client = await getWorkspaceClient(link);

    const channel =
      (await findChannelForAccess(client, CHUNTER_CLASS.Channel, file.channel_id)) ??
      (await findChannelForAccess(client, CHUNTER_CLASS.DirectMessage, file.channel_id));
    if (!channel) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!canSeeChannel(channel, client.account.accountUuid)) {
      return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
    }

    const path = join(await uploadDir(), file.storage_path);
    const info = await stat(path).catch(() => null);
    if (!info) {
      return NextResponse.json({ error: "파일이 서버에 없습니다." }, { status: 410 });
    }

    // Streamed rather than read into a Buffer: a multi-gigabyte download must
    // not be held in the process's memory to be sent.
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(info.size),
        // inline so images and PDFs preview in the browser; the filename is
        // percent-encoded because it is user-supplied text that would otherwise
        // be able to inject header syntax.
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return mobionApiError(error, "파일을 내려받지 못했습니다.");
  }
}
