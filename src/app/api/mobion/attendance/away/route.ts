import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

/**
 * Starts or ends today's current away span (class, a meal, anything that
 * should not count toward worked time without also counting as having left).
 *
 * Driven by the desktop tray's "자리 비움" checkbox, which used to be a purely
 * local snooze (see desktop/src/main.ts) — this is what makes toggling it mean
 * something server-side. A browser tab has no equivalent control yet.
 *
 * Idempotent in both directions: turning "away" on twice does not open a
 * second span (the INSERT's WHERE NOT EXISTS is what stops that), and turning
 * it off with nothing open updates zero rows rather than erroring.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json().catch(() => ({}));
    const away = Boolean(body.away);

    if (away) {
      await query(
        `INSERT INTO mobion_attendance_breaks (user_id, work_date, started_at)
         SELECT $1, CURRENT_DATE, now()
         WHERE NOT EXISTS (
           SELECT 1 FROM mobion_attendance_breaks
           WHERE user_id = $1 AND work_date = CURRENT_DATE AND ended_at IS NULL
         )`,
        [user.id],
      );
    } else {
      await query(
        `UPDATE mobion_attendance_breaks SET ended_at = now()
         WHERE user_id = $1 AND work_date = CURRENT_DATE AND ended_at IS NULL`,
        [user.id],
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "자리 비움 상태를 저장하지 못했습니다.");
  }
}
