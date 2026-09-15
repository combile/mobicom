import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";
import { summarizeDay, type AttendanceBreakRow } from "@/lib/mobion-attendance";

type MemberRow = {
  id: string;
  name: string;
  role: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  checked_in_at: string | null;
};

type BreakRow = { user_id: string; started_at: string; ended_at: string | null };

/**
 * Today's check-in/out for everyone in the lab — open to any signed-in
 * member, unlike /api/mobion/overview (lead/professor, a week of history plus
 * task counts): this is the same "who's in today and since when" a whiteboard
 * by the door would answer, not a management report, so there is no role
 * check beyond being signed in. A week of history and per-person task load
 * stay behind Overview.
 */
export async function GET() {
  try {
    await requireCurrentUser();

    const members = await query<MemberRow>(
      `SELECT u.id, u.name, u.role,
              a.first_seen_at, a.last_seen_at, a.checked_in_at
       FROM mobion_users u
       LEFT JOIN mobion_attendance a
         ON a.user_id = u.id AND a.work_date = CURRENT_DATE
       ORDER BY u.role, u.name`,
    );

    const breakRows = await query<BreakRow>(
      `SELECT user_id, started_at, ended_at
       FROM mobion_attendance_breaks
       WHERE work_date = CURRENT_DATE`,
    );
    const breaksByUser = new Map<string, AttendanceBreakRow[]>();
    for (const b of breakRows.rows) {
      const list = breaksByUser.get(b.user_id) ?? [];
      list.push({ startedAt: b.started_at, endedAt: b.ended_at });
      breaksByUser.set(b.user_id, list);
    }

    return NextResponse.json({
      members: members.rows.map((r) => {
        // Never showed up today: nothing to summarize, and nothing to leave.
        if (!r.first_seen_at || !r.last_seen_at) {
          return {
            id: r.id,
            name: r.name,
            role: r.role,
            checkedInAt: null,
            leftAt: null,
            accumulatedSeconds: 0,
            currentlyAway: false,
          };
        }
        const summary = summarizeDay(
          { firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at },
          breaksByUser.get(r.id) ?? [],
        );
        return {
          id: r.id,
          name: r.name,
          role: r.role,
          checkedInAt: r.checked_in_at ?? r.first_seen_at,
          leftAt: summary.leftAt,
          accumulatedSeconds: Math.round(summary.accumulatedSeconds),
          currentlyAway: summary.currentlyAway,
        };
      }),
    });
  } catch (error) {
    return mobionApiError(error, "출퇴근 현황을 불러오지 못했습니다.");
  }
}
