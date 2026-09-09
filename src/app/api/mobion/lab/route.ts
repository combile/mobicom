import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type PresentRow = { id: string; name: string; avatar_url: string | null };

/**
 * Anything older than this is gone, not lingering. The heartbeat that writes
 * `last_seen_at` (see notifications route's notePresence) fires roughly every
 * 45s, so this leaves room for one missed beat plus jitter before someone
 * quietly drops off the list.
 */
const OFFLINE_AFTER_MS = 120_000;

/**
 * Who is actually in the lab right now — no history, no one who has left.
 *
 * Open to any signed-in member, unlike /api/mobion/overview (lead/professor
 * only, a record of who was here and when): this only answers "right now",
 * which is the same thing anyone standing in the room could already see.
 *
 * A stale row is excluded outright rather than returned with an "offline"
 * flag — this view has nothing to say about someone who isn't here.
 */
export async function GET() {
  try {
    await requireCurrentUser();

    const result = await query<PresentRow>(
      `SELECT u.id, u.name, u.avatar_url
       FROM mobion_presence p
       JOIN mobion_users u ON u.id = p.user_id
       WHERE p.last_seen_at > now() - ($1::int * interval '1 millisecond')
       ORDER BY p.last_seen_at ASC`,
      [OFFLINE_AFTER_MS],
    );

    return NextResponse.json({
      present: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        avatarUrl: r.avatar_url,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "랩 현황을 불러오지 못했습니다.");
  }
}
