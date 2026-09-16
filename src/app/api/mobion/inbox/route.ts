import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";
import { isNotificationKind, type NotificationKind } from "@/lib/mobion-notifications";
import { mentionPlainText } from "@/lib/mobion-mentions";
import {
  ensureHulyLink,
  getWorkspaceClient,
  CHUNTER_CLASS,
  SortingOrder,
  canSeeChannel,
} from "@/lib/mobion-huly";

/** 한 번에 가져오는 개수. 더 필요하면 cursor로 이어 받는다. */
const PAGE_SIZE = 30;

type User = Awaited<ReturnType<typeof requireCurrentUser>>;

type InboxItem = {
  id: string;
  kind: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  actorName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  commentId: string | null;
  channelId: string | null;
  channelName?: string | null;
  createdOn?: number;
};

/** 한 출처의 한 장. 각 행의 cursor는 "이 행 다음부터"를 가리킨다. */
type Page = { items: { item: InboxItem; ts: number; cursor: string }[]; hasMore: boolean };

/**
 * 인박스 전용 조회.
 *
 * GET /api/mobion/notifications와 나눠 둔 이유는 부수효과다. 그쪽은 조회이면서
 * 동시에 출근·재실·마감임박을 쓰는 요청이고, 45초마다 어느 모드에서든 돈다.
 * 인박스가 같은 것을 부르면 그 쓰기가 두 배로 일어난다. 여기서는 읽기만 한다.
 *
 * 홈과 달리 20건·3일 제한이 없다. 지난주에 누가 나를 불렀는지 찾는 것이
 * 이 화면의 존재 이유다.
 *
 * 출처가 둘이다: 알림 테이블과 Huly의 채팅 메시지. "전체"는 둘을 시간순으로
 * 섞고, 커서에 출처별 위치를 따로 담는다(`n:<알림 커서>|c:<채팅 커서>`).
 */
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const kindParam = url.searchParams.get("kind");
    const cursorParam = url.searchParams.get("cursor");

    if (kindParam === "chat") return respond(await chatPage(user, cursorParam));

    // 모르는 값은 조용히 무시하고 전체를 준다. 필터는 화면 편의이지 권한
    // 경계가 아니므로, 오타 하나로 에러를 낼 이유가 없다.
    const kind = kindParam && isNotificationKind(kindParam) ? kindParam : null;
    if (kind) return respond(await notificationPage(user, kind, cursorParam));

    const cursors = new Map(
      (cursorParam ?? "").split("|").map((part) => [part.slice(0, 2), part.slice(2)]),
    );
    const nCursor = cursorParam ? (cursors.get("n:") ?? null) : null;
    const cCursor = cursorParam ? (cursors.get("c:") ?? null) : null;
    // 출처가 끝났으면 커서에 "-"를 남겨 다시 읽지 않는다
    const empty: Page = { items: [], hasMore: false };

    const [notes, chats] = await Promise.all([
      nCursor === "-" ? empty : notificationPage(user, null, nCursor),
      // 채팅 서버가 죽었다고 알림까지 못 보게 할 수는 없다
      cCursor === "-" ? empty : chatPage(user, cCursor).catch(() => empty),
    ]);

    const merged = [...notes.items, ...chats.items]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, PAGE_SIZE);

    // 이번 장에 실린 마지막 행이 그 출처의 다음 시작점이다. 한 행도 안 실렸으면
    // 제자리에 머문다.
    function nextFor(page: Page, prev: string | null) {
      const used = page.items.filter((i) => merged.includes(i));
      const leftover = used.length < page.items.length || page.hasMore;
      if (!leftover) return "-";
      return used.length ? used[used.length - 1].cursor : (prev ?? "");
    }
    const nNext = nextFor(notes, nCursor);
    const cNext = nextFor(chats, cCursor);

    return NextResponse.json({
      notifications: merged.map((m) => m.item),
      nextCursor: nNext === "-" && cNext === "-" ? null : `n:${nNext}|c:${cNext}`,
    });
  } catch (error) {
    return mobionApiError(error, "알림을 불러오지 못했습니다.");
  }
}

function respond(page: Page) {
  return NextResponse.json({
    notifications: page.items.map((i) => i.item),
    nextCursor: page.hasMore ? page.items[page.items.length - 1].cursor : null,
  });
}

type InboxRow = {
  id: string;
  kind: string;
  body: string;
  created_at: string;
  ts: string;
  read_at: string | null;
  actor_name: string | null;
  task_id: string | null;
  task_title: string | null;
  project_id: string | null;
  comment_id: string | null;
  channel_id: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function notificationPage(
  user: User,
  kind: NotificationKind | null,
  cursorParam: string | null,
): Promise<Page> {
  // 커서는 (created_at, id)의 복합 값이다. 언더스코어로 구분하고, 형식 오류는
  // 조용히 "커서 없음"으로 취급한다 (500을 내지 않는다).
  let cursorTimestamp: string | null = null;
  let cursorId: string | null = null;
  if (cursorParam) {
    const parts = cursorParam.split("_");
    if (parts.length === 2) {
      // ISO 8601 타임스탬프인지 검증하고, id는 UUID 형태인지 검증한다.
      // new Date()는 invalid date를 throw하지 않으므로 getTime()을 체크한다.
      const d = new Date(parts[0]);
      if (!Number.isNaN(d.getTime()) && UUID_RE.test(parts[1])) {
        cursorTimestamp = parts[0];
        cursorId = parts[1];
      }
    }
  }

  const result = await query<InboxRow>(
    `SELECT n.id, n.kind, n.body, n.created_at::text as created_at,
            (extract(epoch from n.created_at) * 1000)::text as ts,
            n.read_at::text as read_at,
            a.name AS actor_name,
            n.task_id, t.title AS task_title, t.project_id,
            n.comment_id, n.channel_id
     FROM mobion_notifications n
     LEFT JOIN mobion_users a ON a.id = n.actor_id
     LEFT JOIN mobion_tasks t ON t.id = n.task_id
     WHERE n.user_id = $1
       AND ($2::text IS NULL OR n.kind = $2)
       -- 커서는 (created_at, id) 복합값이다. created_at DESC, id DESC로 읽으므로
       -- "(이 시각, 이 id)보다 이전"인 다음 장이 된다. timestamptz로 비교해야
       -- 컬레이션에 무관하게 실제 시간 순서가 유지된다 (텍스트 비교는 DB
       -- 컬레이션에 따라 같은 초 안에서 순서가 흐트러질 수 있다).
       AND ($3::timestamptz IS NULL OR (n.created_at, n.id) < ($3::timestamptz, $4::uuid))
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $5`,
    [user.id, kind, cursorTimestamp, cursorId, PAGE_SIZE + 1],
  );

  // 한 건 더 받아 다음 장이 있는지 본다. 있으면 그 한 건은 돌려주지 않는다.
  const hasMore = result.rows.length > PAGE_SIZE;
  const rows = hasMore ? result.rows.slice(0, PAGE_SIZE) : result.rows;

  return {
    hasMore,
    items: rows.map((r) => ({
      ts: Number(r.ts),
      cursor: `${r.created_at}_${r.id}`,
      item: {
        id: r.id,
        kind: r.kind,
        body: r.body,
        createdAt: r.created_at,
        readAt: r.read_at,
        actorName: r.actor_name,
        taskId: r.task_id,
        taskTitle: r.task_title,
        projectId: r.project_id,
        commentId: r.comment_id,
        channelId: r.channel_id,
      },
    })),
  };
}

type ChatSpace = { _id: string; name?: string; private?: boolean; members?: string[] };
type ChatMessage = {
  _id: string;
  attachedTo: string;
  message: string;
  createdBy: string;
  createdOn: number;
};

/**
 * 내가 볼 수 있는 채널과 DM에 다른 사람이 보낸 메시지 전부.
 *
 * 알림 테이블을 거치지 않고 Huly에서 바로 읽는다. 메시지마다 수신자 수만큼
 * 알림 행을 쓰면 채널 하나에 글 하나가 인원수만큼의 쓰기가 되고, 그 행들은
 * 채팅 쪽 읽음 표시(mobion_channel_reads)와 따로 놀게 된다. 읽음 여부도
 * 그 표시에서 계산하므로 채팅 화면에서 읽은 것은 여기서도 읽은 것이다.
 *
 * 커서는 마지막 행의 createdOn(epoch ms)이다.
 */
async function chatPage(user: User, cursorParam: string | null): Promise<Page> {
  const none: Page = { items: [], hasMore: false };
  const link = await ensureHulyLink(user);
  if (!link) return none;

  const before = cursorParam && /^\d+$/.test(cursorParam) ? Number(cursorParam) : null;
  const client = await getWorkspaceClient(link);
  const me = client.account.accountUuid;

  const [channels, dms] = await Promise.all([
    client.findAll<ChatSpace>(CHUNTER_CLASS.Channel, {}),
    client.findAll<ChatSpace>(CHUNTER_CLASS.DirectMessage, {}),
  ]);
  // stream/route.ts와 같은 판정: DM은 참여자 목록만으로 본다
  const spaces = [
    ...channels.filter((c) => canSeeChannel(c, me)),
    ...dms.filter((d) => (d.members ?? []).includes(me)),
  ];
  if (spaces.length === 0) return none;

  const rows = await client.findAll<ChatMessage>(
    CHUNTER_CLASS.ChatMessage,
    {
      attachedTo: { $in: spaces.map((s) => s._id) },
      createdBy: { $ne: client.account.primarySocialId },
      ...(before !== null ? { createdOn: { $lt: before } } : {}),
    },
    { limit: PAGE_SIZE + 1, sort: { createdOn: SortingOrder.Descending } },
  );
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const [people, reads] = await Promise.all([
    query<{ huly_social_id: string | null; huly_account_uuid: string | null; name: string }>(
      `SELECT l.huly_social_id, l.huly_account_uuid, u.name
         FROM mobion_huly_link l JOIN mobion_users u ON u.id = l.user_id`,
    ),
    query<{ channel_id: string; last_read_on: string }>(
      `SELECT channel_id, last_read_on::text FROM mobion_channel_reads WHERE user_id = $1`,
      [user.id],
    ),
  ]);
  const nameBySocial = new Map(people.rows.map((p) => [p.huly_social_id, p.name]));
  const nameByAccount = new Map(people.rows.map((p) => [p.huly_account_uuid, p.name]));
  const lastRead = new Map(reads.rows.map((r) => [r.channel_id, Number(r.last_read_on)]));

  // DM은 이름이 없다 — 상대방 이름이 곧 대화의 이름이다
  const spaceName = new Map<string, string>();
  for (const c of channels) spaceName.set(c._id, `#${c.name ?? ""}`);
  for (const d of dms) {
    const other = (d.members ?? []).find((m) => m !== me);
    spaceName.set(d._id, other ? (nameByAccount.get(other) ?? "DM") : "DM");
  }

  return {
    hasMore,
    items: page.map((m) => ({
      ts: m.createdOn,
      cursor: String(m.createdOn),
      item: {
        id: m._id,
        kind: "chat",
        body: mentionPlainText(m.message).slice(0, 200),
        createdAt: new Date(m.createdOn).toISOString(),
        readAt:
          m.createdOn <= (lastRead.get(m.attachedTo) ?? 0)
            ? new Date(m.createdOn).toISOString()
            : null,
        actorName: nameBySocial.get(m.createdBy) ?? null,
        taskId: null,
        taskTitle: null,
        projectId: null,
        commentId: null,
        channelId: m.attachedTo,
        channelName: spaceName.get(m.attachedTo) ?? null,
        createdOn: m.createdOn,
      },
    })),
  };
}
