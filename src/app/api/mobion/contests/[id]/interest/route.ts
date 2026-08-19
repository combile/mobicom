import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

/**
 * Marking interest is what puts a contest on the schedule.
 *
 * Collected postings are not scheduled automatically: a crawler brings in
 * everything a source publishes and most of it will not concern this lab.
 * Dropping all of it onto the schedule would bury the team's own deadlines.
 *
 * Interest is per user rather than per lab, so one person tracking something
 * does not put it on everyone else's schedule.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    const exists = await query<{ id: string }>(`SELECT id FROM mobion_contests WHERE id = $1`, [
      id,
    ]);
    if (!exists.rows[0]) {
      return NextResponse.json({ error: "대회를 찾을 수 없습니다." }, { status: 404 });
    }

    // Idempotent: pressing an already-marked button should not error.
    await query(
      `INSERT INTO mobion_contest_interests (contest_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (contest_id, user_id) DO NOTHING`,
      [id, user.id],
    );

    return NextResponse.json({ interested: true });
  } catch (error) {
    return mobionApiError(error, "관심 표시에 실패했습니다.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    await query(`DELETE FROM mobion_contest_interests WHERE contest_id = $1 AND user_id = $2`, [
      id,
      user.id,
    ]);

    return NextResponse.json({ interested: false });
  } catch (error) {
    return mobionApiError(error, "관심 해제에 실패했습니다.");
  }
}
