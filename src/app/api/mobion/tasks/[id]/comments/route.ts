import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";
import { parseMentionSegments } from "@/lib/mobion-mentions";

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
};

/**
 * Discussion attached to one task.
 *
 * Without it, working something out means going back to chat, where the
 * reasoning is buried under unrelated messages within the hour. Keeping the
 * discussion on the task is the difference between a record of what was
 * decided and a list of titles nobody can explain later.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCurrentUser();
    const { id } = await params;

    const result = await query<CommentRow>(
      `SELECT c.id, c.body, c.created_at, c.user_id AS author_id, u.name AS author_name
       FROM mobion_task_comments c
       LEFT JOIN mobion_users u ON u.id = c.user_id
       WHERE c.task_id = $1
       ORDER BY c.created_at ASC`,
      [id],
    );

    return NextResponse.json({
      comments: result.rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.created_at,
        authorId: r.author_id,
        authorName: r.author_name,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "댓글을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const payload = await request.json();

    const body = String(payload.body ?? "")
      .trim()
      .slice(0, 2000);
    if (!body) {
      return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
    }

    const exists = await query<{ id: string; title: string; assignee_id: string | null }>(
      `SELECT id, title, assignee_id FROM mobion_tasks WHERE id = $1`,
      [id],
    );
    const task = exists.rows[0];
    if (!task) {
      return NextResponse.json({ error: "태스크를 찾을 수 없습니다." }, { status: 404 });
    }

    // Insert and resolve the author name in one round trip, so the client can
    // render the new comment without refetching the whole thread.
    const result = await query<CommentRow>(
      `WITH inserted AS (
         INSERT INTO mobion_task_comments (task_id, user_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, body, created_at, user_id
       )
       SELECT i.id, i.body, i.created_at, i.user_id AS author_id, u.name AS author_name
       FROM inserted i
       LEFT JOIN mobion_users u ON u.id = i.user_id`,
      [id, user.id, body],
    );

    // Being named is a direct request, so mentions notify regardless of who is
    // assigned. Self-mentions are dropped, and the set removes duplicates so
    // naming someone twice in one comment does not notify them twice.
    const mentioned = new Set(
      parseMentionSegments(body)
        .filter((seg) => seg.type === "mention" && seg.userId !== user.id)
        .map((seg) => (seg as { userId: string }).userId),
    );

    for (const userId of mentioned) {
      await query(
        `INSERT INTO mobion_notifications (user_id, kind, task_id, actor_id, body)
         VALUES ($1, 'comment', $2, $3, $4)`,
        [userId, id, user.id, body.slice(0, 200)],
      );
    }

    // Then the assignee, unless they wrote it or were already named — one
    // comment should not arrive twice.
    if (task.assignee_id && task.assignee_id !== user.id && !mentioned.has(task.assignee_id)) {
      await query(
        `INSERT INTO mobion_notifications (user_id, kind, task_id, actor_id, body)
         VALUES ($1, 'comment', $2, $3, $4)`,
        [task.assignee_id, id, user.id, body.slice(0, 200)],
      );
    }

    const c = result.rows[0];
    return NextResponse.json({
      comment: {
        id: c.id,
        body: c.body,
        createdAt: c.created_at,
        authorId: c.author_id,
        authorName: c.author_name,
      },
    });
  } catch (error) {
    return mobionApiError(error, "댓글을 남기지 못했습니다.");
  }
}
