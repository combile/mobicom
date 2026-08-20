import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type DayRow = {
  work_date: string;
  first_seen_at: string;
  checked_in_at: string | null;
  note: string | null;
};

const HISTORY_DAYS = 14;

/**
 * This person's own attendance, and their corrections to it.
 *
 * The recorded time is what the server saw, which is close to but not the same
 * as when someone arrived — a tab opened from home, a morning spent in the
 * server room, a laptop left running overnight all read wrong. So the observed
 * time is kept as it was and a correction sits beside it rather than on top of
 * it, and both are shown. A record that can be silently rewritten is not worth
 * keeping; one that cannot be corrected at all stops matching reality within a
 * week.
 *
 * Own records only. Reading anyone else's goes through the overview endpoint,
 * which checks the role.
 */
export async function GET() {
  try {
    const user = await requireCurrentUser();

    const result = await query<DayRow>(
      `SELECT work_date::text, first_seen_at, checked_in_at, note
       FROM mobion_attendance
       WHERE user_id = $1 AND work_date > CURRENT_DATE - $2::int
       ORDER BY work_date DESC`,
      [user.id, HISTORY_DAYS],
    );

    return NextResponse.json({
      days: result.rows.map((r) => ({
        date: r.work_date,
        firstSeenAt: r.first_seen_at,
        checkedInAt: r.checked_in_at,
        note: r.note,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "출근 기록을 불러오지 못했습니다.");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();

    const date = String(body.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }

    // "HH:MM" on that day, or null to drop the correction and fall back to the
    // observed time
    const time = body.time == null ? null : String(body.time);
    if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return NextResponse.json({ error: "시각 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const note = body.note != null ? String(body.note).trim().slice(0, 200) : null;

    const result = await query<DayRow>(
      `UPDATE mobion_attendance SET
         checked_in_at = CASE
           WHEN $3::text IS NULL THEN NULL
           -- built from the row's own date, so a correction can never land on
           -- a different day than the one being corrected
           ELSE (work_date::text || ' ' || $3::text)::timestamptz
         END,
         note = $4,
         corrected_at = CASE WHEN $3::text IS NULL THEN NULL ELSE now() END
       WHERE user_id = $1 AND work_date = $2::date
       RETURNING work_date::text, first_seen_at, checked_in_at, note`,
      [user.id, date, time, note],
    );

    const row = result.rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "그날의 기록이 없습니다. 기록이 있는 날만 고칠 수 있습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      day: {
        date: row.work_date,
        firstSeenAt: row.first_seen_at,
        checkedInAt: row.checked_in_at,
        note: row.note,
      },
    });
  } catch (error) {
    return mobionApiError(error, "출근 기록을 고치지 못했습니다.");
  }
}
