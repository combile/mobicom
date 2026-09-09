import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

/**
 * Channels this person pinned to the top of their list.
 *
 * Per-person, so it belongs in this app's Postgres rather than on the Huly
 * channel: pinning is a view preference, not a property of the conversation.
 * No membership check is needed to pin — an id that is not visible simply never
 * appears in the list the client renders it against.
 */
export async function GET() {
  try {
    const user = await requireCurrentUser();
    const rows = await query<{ channel_id: string }>(
      `SELECT channel_id FROM mobion_channel_favorites
        WHERE user_id = $1 ORDER BY sort_order, created_at`,
      [user.id],
    );
    return NextResponse.json({ favorites: rows.rows.map((r) => r.channel_id) });
  } catch (error) {
    return mobionApiError(error, "즐겨찾기를 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const channelId = String(body.channelId ?? "");
    if (!channelId) {
      return NextResponse.json({ error: "채널이 필요합니다." }, { status: 400 });
    }

    // Toggle, same shape as reactions: pressing the star again unpins.
    const removed = await query(
      `DELETE FROM mobion_channel_favorites WHERE user_id = $1 AND channel_id = $2`,
      [user.id, channelId],
    );
    if (removed.rowCount === 0) {
      await query(
        `INSERT INTO mobion_channel_favorites (user_id, channel_id, sort_order)
         VALUES ($1, $2, COALESCE(
           (SELECT max(sort_order) + 1 FROM mobion_channel_favorites WHERE user_id = $1), 0))
         ON CONFLICT DO NOTHING`,
        [user.id, channelId],
      );
    }

    const rows = await query<{ channel_id: string }>(
      `SELECT channel_id FROM mobion_channel_favorites
        WHERE user_id = $1 ORDER BY sort_order, created_at`,
      [user.id],
    );
    return NextResponse.json({ favorites: rows.rows.map((r) => r.channel_id) });
  } catch (error) {
    return mobionApiError(error, "즐겨찾기를 바꾸지 못했습니다.");
  }
}
