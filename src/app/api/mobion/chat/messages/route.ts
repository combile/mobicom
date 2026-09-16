import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import {
  ensureHulyLink,
  getWorkspaceClient,
  CHUNTER_CLASS,
  HULY_CORE_SPACE,
  SortingOrder,
  canSeeChannel,
  findChannelForAccess,
} from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";
import { mentionedUserIds, mentionPlainText } from "@/lib/mobion-mentions";

type ChatMessage = {
  _id: string;
  attachedTo: string;
  message: string;
  createdBy: string;
  createdOn: number;
  // Huly bumps this on every tx against the doc, so an edit is detectable
  // without storing an "edited" flag of our own.
  modifiedOn?: number;
};

type WorkspaceClient = Awaited<ReturnType<typeof getWorkspaceClient>>;

type ChannelAccess = {
  error: NextResponse | null;
  /** 통과한 경우의 대화 문서. 멘션 알림이 수신자별로 같은 판정을 다시 한다. */
  doc?: { private?: boolean; members?: string[] };
  isChannel?: boolean;
};

/**
 * Refuses the request unless this account may use the given conversation.
 *
 * `kind` is what the caller claims the id is; GET has no such parameter, so it
 * passes null and both classes are tried. A DM is judged on its participant
 * list alone rather than through canSeeChannel — a DM is never public, so it
 * must not become readable if its `private` flag is ever missing.
 */
async function assertChannelAccess(
  client: WorkspaceClient,
  channelId: string,
  kind: "channel" | "dm" | null,
): Promise<ChannelAccess> {
  const asChannel =
    kind === "dm" ? null : await findChannelForAccess(client, CHUNTER_CLASS.Channel, channelId);
  const doc =
    asChannel ??
    (kind === "channel"
      ? null
      : await findChannelForAccess(client, CHUNTER_CLASS.DirectMessage, channelId));

  if (!doc) {
    return { error: NextResponse.json({ error: "채널을 찾을 수 없습니다." }, { status: 404 }) };
  }

  const me = client.account.accountUuid;
  const allowed = asChannel ? canSeeChannel(doc, me) : (doc.members ?? []).includes(me);
  if (!allowed) {
    return { error: NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 }) };
  }
  return { error: null, doc, isChannel: Boolean(asChannel) };
}

/** 클라이언트가 보낸 글에서 뽑은 id다 — uuid 형태가 아닌 것은 질의에 넣지 않는다. */
const MENTION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 채팅에서 호명된 사람에게 알림을 남긴다.
 *
 * 태스크 댓글(tasks/[id]/comments)이 이미 하던 일을 채팅도 한다. 이것이
 * 없어서 채팅 멘션은 그 순간의 소리와 데스크톱 팝업뿐이었고 — 자리를 비운
 * 사이에 불린 사람에게는 인박스에도 알림함에도 아무 흔적이 남지 않았다.
 *
 * 볼 수 없는 대화의 알림은 보내지 않는다. body에 메시지 본문이 실려 나가므로
 * 그러지 않으면 비공개 채널에 이름을 적는 것만으로 내용이 밖으로 샌다.
 * 판정식은 assertChannelAccess가 보낸 사람에게 쓴 것과 같다.
 */
async function notifyChatMentions(
  text: string,
  channelId: string,
  authorId: string,
  access: ChannelAccess,
) {
  const ids = mentionedUserIds(text, authorId).filter((id) => MENTION_ID_RE.test(id));
  if (ids.length === 0 || !access.doc) return;

  // Huly의 Channel.members는 AccountUuid로 적혀 있다(mobion-db.ts 참고).
  // 링크가 없는 사람은 애초에 채팅을 볼 수 없으므로 여기서 자연히 빠진다.
  const links = await query<{ user_id: string; huly_account_uuid: string | null }>(
    `SELECT user_id, huly_account_uuid FROM mobion_huly_link WHERE user_id = ANY($1::uuid[])`,
    [ids],
  );

  // 저장된 마크업 그대로면 알림 한복판에 uuid가 찍힌다
  const body = mentionPlainText(text).slice(0, 200);

  for (const row of links.rows) {
    const uuid = row.huly_account_uuid;
    if (!uuid) continue;
    const visible = access.isChannel
      ? canSeeChannel(access.doc, uuid)
      : (access.doc.members ?? []).includes(uuid);
    if (!visible) continue;

    // 멘션은 직접 호명이므로 수신 설정과 무관하게 항상 간다 — 댓글 쪽과 같다.
    await query(
      `INSERT INTO mobion_notifications (user_id, kind, actor_id, channel_id, body)
       VALUES ($1, 'mention', $2, $3, $4)`,
      [row.user_id, authorId, channelId, body],
    );
  }
}

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
 * Visibility IS checked here, explicitly. Huly's own space scoping cannot do it
 * for us: every message is stored under HULY_CORE_SPACE (using the channel's own
 * id there breaks live delta delivery — see mobion-huly.ts), so all messages in
 * the workspace share one space that every account can read. Without the check
 * below, knowing a channel id was enough to read a private channel.
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

    // provisions on first use, so an account activated while Huly was down is
    // not stuck without chat forever
    const link = await ensureHulyLink(user);
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }

    const client = await getWorkspaceClient(link);
    const access = await assertChannelAccess(client, channelId, null);
    if (access.error) return access.error;

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

    // provisions on first use, so an account activated while Huly was down is
    // not stuck without chat forever
    const link = await ensureHulyLink(user);
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }

    const client = await getWorkspaceClient(link);
    // Same gate as GET: without it, a channel id was enough to post into a
    // private channel, and a non-existent id silently created an orphan message.
    const access = await assertChannelAccess(
      client,
      channelId,
      body.channelClass === "dm" ? "dm" : "channel",
    );
    if (access.error) return access.error;

    const created = await client.addCollection({
      _class: CHUNTER_CLASS.ChatMessage,
      space: HULY_CORE_SPACE,
      attachedTo: channelId,
      attachedToClass: channelClass,
      collection: "messages",
      attributes: { message: text },
    });

    // The id of the new message, needed to record a reply link or to attach
    // files. addCollection returns the ref for the doc it created.
    const messageId = String(created ?? "");

    const replyTo = String(body.replyTo ?? "").trim();
    if (messageId && replyTo) {
      // Best effort: a reply whose quote link fails to save is still a message
      // worth keeping, so this must not fail the send.
      await query(
        `INSERT INTO mobion_message_replies (message_id, reply_to)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [messageId, replyTo],
      ).catch(() => {});
    }

    // 최선 노력: 알림을 못 남겼다고 이미 보낸 메시지를 실패로 돌릴 수는 없다.
    await notifyChatMentions(text, channelId, user.id, access).catch(() => {});

    return NextResponse.json({ ok: true, messageId });
  } catch (error) {
    return mobionApiError(error, "메시지 전송 실패");
  }
}

/**
 * Finds a message and confirms this person may act on it.
 *
 * Two separate questions: may they see the conversation at all (the same gate
 * GET and POST use), and is the message theirs. Ownership compares
 * primarySocialId because that is what ChatMessage.createdBy holds — accountUuid
 * is a different id space and would never match (see mobion-huly.ts).
 */
async function findOwnMessage(
  client: WorkspaceClient,
  messageId: string,
  allowAnyAuthor: boolean,
): Promise<{ message: ChatMessage } | { error: NextResponse }> {
  const rows = await client.findAll<ChatMessage>(
    CHUNTER_CLASS.ChatMessage,
    { _id: messageId },
    { limit: 1 },
  );
  const message = rows[0];
  if (!message) {
    return { error: NextResponse.json({ error: "메시지를 찾을 수 없습니다." }, { status: 404 }) };
  }

  const access = await assertChannelAccess(client, message.attachedTo, null);
  if (access.error) return { error: access.error };

  if (!allowAnyAuthor && message.createdBy !== client.account.primarySocialId) {
    return {
      error: NextResponse.json({ error: "본인 메시지만 수정할 수 있습니다." }, { status: 403 }),
    };
  }
  return { message };
}

/** Edits a message's text in place. Author only. */
export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const messageId = String(body.messageId ?? "");
    const text = String(body.text ?? "").trim();

    if (!messageId || !text) {
      return NextResponse.json({ error: "메시지와 내용이 필요합니다." }, { status: 400 });
    }

    const link = await ensureHulyLink(user);
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }

    const client = await getWorkspaceClient(link);
    const found = await findOwnMessage(client, messageId, false);
    if ("error" in found) return found.error;

    await client.updateDoc({
      _class: CHUNTER_CLASS.ChatMessage,
      space: HULY_CORE_SPACE,
      objectId: messageId,
      operations: { message: text },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "메시지를 수정하지 못했습니다.");
  }
}

/**
 * Deletes a message. The author may delete their own; a lab lead may delete
 * anyone's, matching how task and milestone deletion already works.
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const messageId = String(url.searchParams.get("messageId") ?? "");
    if (!messageId) {
      return NextResponse.json({ error: "메시지가 필요합니다." }, { status: 400 });
    }

    const link = await ensureHulyLink(user);
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }

    const client = await getWorkspaceClient(link);
    const found = await findOwnMessage(client, messageId, user.role === "lead");
    if ("error" in found) return found.error;

    await client.removeDoc({
      _class: CHUNTER_CLASS.ChatMessage,
      space: HULY_CORE_SPACE,
      objectId: messageId,
    });

    // The message is gone from Huly, so rows keyed by its id can never be
    // rendered again — leaving them would be rows that only ever grow.
    await query(`DELETE FROM mobion_message_reactions WHERE message_id = $1`, [messageId]);
    await query(`DELETE FROM mobion_message_replies WHERE message_id = $1 OR reply_to = $1`, [
      messageId,
    ]);
    await query(`UPDATE mobion_attachments SET message_id = NULL WHERE message_id = $1`, [
      messageId,
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "메시지를 삭제하지 못했습니다.");
  }
}
