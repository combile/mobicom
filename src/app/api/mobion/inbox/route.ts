import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";
import { isNotificationKind } from "@/lib/mobion-notifications";

/** 한 번에 가져오는 개수. 더 필요하면 cursor로 이어 받는다. */
const PAGE_SIZE = 30;

type InboxRow = {
  id: string;
  kind: string;
  body: string;
  created_at: string;
  read_at: string | null;
  actor_name: string | null;
  task_id: string | null;
  task_title: string | null;
  project_id: string | null;
  comment_id: string | null;
};

/**
 * 인박스 전용 조회.
 *
 * GET /api/mobion/notifications와 나눠 둔 이유는 부수효과다. 그쪽은 조회이면서
 * 동시에 출근·재실·마감임박을 쓰는 요청이고, 45초마다 어느 모드에서든 돈다.
 * 인박스가 같은 것을 부르면 그 쓰기가 두 배로 일어난다. 여기서는 읽기만 한다.
 *
 * 홈과 달리 20건·3일 제한이 없다. 지난주에 누가 나를 불렀는지 찾는 것이
 * 이 화면의 존재 이유다.
 */
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const kindParam = url.searchParams.get("kind");
    // 모르는 값은 조용히 무시하고 전체를 준다. 필터는 화면 편의이지 권한
    // 경계가 아니므로, 오타 하나로 에러를 낼 이유가 없다.
    const kind = kindParam && isNotificationKind(kindParam) ? kindParam : null;
    const cursorParam = url.searchParams.get("cursor");

    // 커서는 (created_at, id)의 복합 값이다. 언더스코어로 구분하고, 형식 오류는
    // 조용히 "커서 없음"으로 취급한다 (500을 내지 않는다).
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
      `SELECT n.id, n.kind, n.body, n.created_at::text as created_at, n.read_at::text as read_at,
              a.name AS actor_name,
              n.task_id, t.title AS task_title, t.project_id,
              n.comment_id
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

    // 커서는 반환한 마지막 행의 값이다 — 그 다음 페이지는
    // 이 값보다 "작은" 행들이다 (DESC 정렬에서). 이전 페이지의 마지막 행보다
    // 이전에 오는 모든 행을 다음 페이지에서 본다.
    const nextCursor = hasMore && rows.length > 0
      ? `${rows[rows.length - 1].created_at}_${rows[rows.length - 1].id}`
      : null;

    return NextResponse.json({
      notifications: rows.map((r) => ({
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
      })),
      nextCursor,
    });
  } catch (error) {
    return mobionApiError(error, "알림을 불러오지 못했습니다.");
  }
}
