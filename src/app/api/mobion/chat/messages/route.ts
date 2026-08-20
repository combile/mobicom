import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import {
  getWorkspaceClient,
  CHUNTER_CLASS,
  HULY_CORE_SPACE,
  SortingOrder,
} from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type HulyLinkRow = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
};

type ChatMessage = {
  _id: string;
  attachedTo: string;
  message: string;
  createdBy: string;
  createdOn: number;
};

const PAGE_LIMIT = 50;

/**
 * Older messages in one conversation, for scrolling back past the snapshot.
 *
 * The SSE snapshot carries only the recent end of each conversation, so
 * everything before that has to be reachable some other way. Paging by
 * timestamp rather than by offset: new messages arriving while someone reads
 * backwards would shift every offset by one and quietly repeat or skip a
 * message.
 *
 * Visibility needs no check of its own — findAll runs as the requester's own
 * Huly account, and Huly scopes spaces server-side, so a channel they are not
 * a member of simply returns nothing.
 */
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const channelId = String(url.searchParams.get("channelId") ?? "");
    const beforeParam = url.searchParams.get("before");

    if (!channelId) {
      return NextResponse.json({ error: "채널이 필요합니다." }, { status: 400 });
    }
    const before = beforeParam ? Number(beforeParam) : null;
    if (before !== null && !Number.isFinite(before)) {
      return NextResponse.json({ error: "잘못된 기준 시각입니다." }, { status: 400 });
    }

    const result = await query<HulyLinkRow>(
      `SELECT huly_account_email, huly_credential_encrypted, huly_workspace
       FROM mobion_huly_link WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    const link = result.rows[0];
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }

    const client = await getWorkspaceClient(link);
    const rows = await client.findAll<ChatMessage>(
      CHUNTER_CLASS.ChatMessage,
      before === null
        ? { attachedTo: channelId }
        : { attachedTo: channelId, createdOn: { $lt: before } },
      { limit: PAGE_LIMIT, sort: { createdOn: SortingOrder.Descending } },
    );

    // Same lookup the stream does, so a message that scrolls into view carries
    // the same name as one that arrived live rather than a raw Huly id.
    const authorRows = await query<{
      huly_social_id: string | null;
      name: string;
      avatar_url: string | null;
    }>(
      `SELECT l.huly_social_id, u.name, u.avatar_url
       FROM mobion_huly_link l JOIN mobion_users u ON u.id = l.user_id
       WHERE l.huly_social_id IS NOT NULL`,
    )
      .then((r) => r.rows)
      .catch(() => []);
    const names = new Map(authorRows.map((r) => [r.huly_social_id, r.name]));
    const avatars = new Map(authorRows.map((r) => [r.huly_social_id, r.avatar_url]));

    return NextResponse.json({
      messages: rows
        .sort((a, b) => a.createdOn - b.createdOn)
        .map((m) => ({
          id: m._id,
          channelId: m.attachedTo,
          text: m.message,
          authorId: m.createdBy,
          authorName: names.get(m.createdBy) ?? null,
          authorAvatarUrl: avatars.get(m.createdBy) ?? null,
          createdOn: m.createdOn,
        })),
      // fewer than asked for means the start of the conversation was reached
      exhausted: rows.length < PAGE_LIMIT,
    });
  } catch (error) {
    return mobionApiError(error, "이전 메시지를 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const channelId = String(body.channelId ?? "");
    const channelClass = body.channelClass === "dm" ? CHUNTER_CLASS.DirectMessage : CHUNTER_CLASS.Channel;
    const text = String(body.text ?? "").trim();

    if (!channelId || !text) {
      return NextResponse.json({ error: "채널과 메시지 내용이 필요합니다." }, { status: 400 });
    }

    const result = await query<HulyLinkRow>(
      `SELECT huly_account_email, huly_credential_encrypted, huly_workspace
       FROM mobion_huly_link WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    const link = result.rows[0];
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }

    const client = await getWorkspaceClient(link);
    await client.addCollection({
      _class: CHUNTER_CLASS.ChatMessage,
      space: HULY_CORE_SPACE,
      attachedTo: channelId,
      attachedToClass: channelClass,
      collection: "messages",
      attributes: { message: text },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "메시지 전송 실패");
  }
}
