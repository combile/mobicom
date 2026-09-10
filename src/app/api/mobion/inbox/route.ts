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
    const cursor = url.searchParams.get("cursor");

    const result = await query<InboxRow>(
      `SELECT n.id, n.kind, n.body, n.created_at, n.read_at,
              a.name AS actor_name,
              n.task_id, t.title AS task_title, t.project_id,
              n.comment_id
       FROM mobion_notifications n
       LEFT JOIN mobion_users a ON a.id = n.actor_id
       LEFT JOIN mobion_tasks t ON t.id = n.task_id
       WHERE n.user_id = $1
         AND ($2::text IS NULL OR n.kind = $2)
         -- 커서는 시각이다. created_at DESC로 읽으므로 "이 시각보다 이전"이
         -- 다음 장이 된다.
         AND ($3::timestamptz IS NULL OR n.created_at < $3)
       ORDER BY n.created_at DESC
       LIMIT $4`,
      [user.id, kind, cursor, PAGE_SIZE + 1],
    );

    // 한 건 더 받아 다음 장이 있는지 본다. 있으면 그 한 건은 돌려주지 않는다.
    const hasMore = result.rows.length > PAGE_SIZE;
    const rows = hasMore ? result.rows.slice(0, PAGE_SIZE) : result.rows;

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
      nextCursor: hasMore ? rows[rows.length - 1].created_at : null,
    });
  } catch (error) {
    return mobionApiError(error, "알림을 불러오지 못했습니다.");
  }
}
