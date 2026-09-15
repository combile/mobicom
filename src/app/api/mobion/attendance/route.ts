import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";
import { summarizeDay, type AttendanceBreakRow } from "@/lib/mobion-attendance";

type DayRow = {
  work_date: string;
  first_seen_at: string;
  last_seen_at: string;
  checked_in_at: string | null;
  note: string | null;
};

type BreakRow = { work_date: string; started_at: string; ended_at: string | null };

const HISTORY_DAYS = 14;

/** Attaches leftAt/accumulatedSeconds/currentlyAway to each day, using that day's own breaks. */
async function withSummaries(userId: string, rows: DayRow[]) {
  if (rows.length === 0) return [];

  const dates = rows.map((r) => r.work_date);
  const breakRows = await query<BreakRow>(
    `SELECT work_date::text, started_at, ended_at
     FROM mobion_attendance_breaks
     WHERE user_id = $1 AND work_date = ANY($2::date[])`,
    [userId, dates],
  );
  const breaksByDate = new Map<string, AttendanceBreakRow[]>();
  for (const b of breakRows.rows) {
    const list = breaksByDate.get(b.work_date) ?? [];
    list.push({ startedAt: b.started_at, endedAt: b.ended_at });
    breaksByDate.set(b.work_date, list);
  }

  return rows.map((r) => {
    const summary = summarizeDay(
      { firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at },
      breaksByDate.get(r.work_date) ?? [],
    );
    return {
      date: r.work_date,
      firstSeenAt: r.first_seen_at,
      checkedInAt: r.checked_in_at,
      note: r.note,
      leftAt: summary.leftAt,
      accumulatedSeconds: Math.round(summary.accumulatedSeconds),
      currentlyAway: summary.currentlyAway,
    };
  });
}

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
 * Own records only. Reading anyone else's goes through the team endpoint
 * (today only) or overview (lead/professor, a week of history).
 */
export async function GET() {
  try {
    const user = await requireCurrentUser();

    const result = await query<DayRow>(
      `SELECT work_date::text, first_seen_at, last_seen_at, checked_in_at, note
       FROM mobion_attendance
       WHERE user_id = $1 AND work_date > CURRENT_DATE - $2::int
       ORDER BY work_date DESC`,
      [user.id, HISTORY_DAYS],
    );

    return NextResponse.json({ days: await withSummaries(user.id, result.rows) });
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
       RETURNING work_date::text, first_seen_at, last_seen_at, checked_in_at, note`,
      [user.id, date, time, note],
    );

    const row = result.rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "그날의 기록이 없습니다. 기록이 있는 날만 고칠 수 있습니다." },
        { status: 404 },
      );
    }

    const [day] = await withSummaries(user.id, [row]);
    return NextResponse.json({ day });
  } catch (error) {
    return mobionApiError(error, "출근 기록을 고치지 못했습니다.");
  }
}
