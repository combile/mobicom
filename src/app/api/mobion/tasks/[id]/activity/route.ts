import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type ActivityRow = {
  id: string;
  field: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  actor_name: string | null;
};

/**
 * What changed on one task.
 *
 * The discussion says why something was decided; this says that it was, and
 * when. Together they answer a question a task cannot answer on its own — a
 * due date three weeks past the one everyone remembers agreeing to used to
 * leave no trace of who moved it.
 *
 * Oldest first, matching the comment thread it is read alongside.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCurrentUser();
    const { id } = await params;

    const result = await query<ActivityRow>(
      `SELECT a.id, a.field, a.from_value, a.to_value, a.created_at, u.name AS actor_name
       FROM mobion_task_activity a
       LEFT JOIN mobion_users u ON u.id = a.actor_id
       WHERE a.task_id = $1
       ORDER BY a.created_at ASC`,
      [id],
    );

    return NextResponse.json({
      entries: result.rows.map((r) => ({
        id: r.id,
        field: r.field,
        from: r.from_value,
        to: r.to_value,
        createdAt: r.created_at,
        // null once the account is gone; the entry itself still stands
        actorName: r.actor_name,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "변경 내역을 불러오지 못했습니다.");
  }
}
