import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id: projectId } = await params;
    const body = await request.json();
    const title = String(body.title ?? "").trim().slice(0, 150);
    const description = String(body.description ?? "").trim().slice(0, 1000);
    const assigneeId = body.assigneeId ? String(body.assigneeId) : null;
    const milestoneId = body.milestoneId ? String(body.milestoneId) : null;
    const dueDate = body.dueDate ? String(body.dueDate) : null;
    // set when the task was raised from a chat message, so it can link back
    const sourceChannelId = body.sourceChannelId ? String(body.sourceChannelId) : null;
    const sourceMessageId = body.sourceMessageId ? String(body.sourceMessageId) : null;
    const sourceExcerpt = body.sourceExcerpt
      ? String(body.sourceExcerpt).trim().slice(0, 500)
      : null;

    if (!title) {
      return NextResponse.json({ error: "태스크 제목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query<{
      id: string;
      title: string;
      description: string;
      status: string;
      due_date: string | null;
      milestone_id: string | null;
      assignee_id: string | null;
    }>(
      `INSERT INTO mobion_tasks
         (project_id, milestone_id, title, description, assignee_id, due_date, created_by,
          source_channel_id, source_message_id, source_excerpt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, title, description, status, due_date, milestone_id, assignee_id`,
      [projectId, milestoneId, title, description, assigneeId, dueDate, user.id,
       sourceChannelId, sourceMessageId, sourceExcerpt],
    );

    const t = result.rows[0];

    // 처음 담당자로 지정되는 것도 손바뀜이다. 지금까지 이 알림은 PATCH에만
    // 있어서, 태스크를 만들면서 담당자를 지정하면 그 사람은 아무 통지도
    // 받지 못했다. 배정은 수신 설정과 무관하게 항상 간다.
    if (assigneeId && assigneeId !== user.id) {
      await query(
        `INSERT INTO mobion_notifications (user_id, kind, task_id, actor_id, body)
         VALUES ($1, 'assigned', $2, $3, $4)`,
        [assigneeId, t.id, user.id, t.title.slice(0, 200)],
      );
    }

    return NextResponse.json({
      task: {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueDate: t.due_date,
        milestoneId: t.milestone_id,
        assigneeId: t.assignee_id,
      },
    });
  } catch (error) {
    return mobionApiError(error, "태스크 생성 실패");
  }
}
