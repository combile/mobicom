import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

/**
 * How far into each conversation this person has read.
 *
 * Without it there is no way to tell which channels have something new, so
 * every one has to be opened to find out — the same as having no signal at
 * all, which is why a chat app people leave open needs this before it needs
 * anything else.
 *
 * A timestamp rather than a per-message read flag: the question being answered
 * is "anything after this point", and a flag per message would mean one row
 * per message per person to answer it.
 */
export async function GET() {
  try {
    const user = await requireCurrentUser();

    const result = await query<{ channel_id: string; last_read_on: string }>(
      `SELECT channel_id, last_read_on::text FROM mobion_channel_reads WHERE user_id = $1`,
      [user.id],
    );

    return NextResponse.json({
      // pg returns BIGINT as a string to avoid losing precision; epoch
      // milliseconds sit well inside Number's safe range, so converting here
      // keeps the client comparing numbers against numbers
      reads: Object.fromEntries(result.rows.map((r) => [r.channel_id, Number(r.last_read_on)])),
    });
  } catch (error) {
    return mobionApiError(error, "읽음 정보를 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const channelId = String(body.channelId ?? "");
    const lastReadOn = Number(body.lastReadOn);

    if (!channelId || !Number.isFinite(lastReadOn)) {
      return NextResponse.json({ error: "채널과 기준 시각이 필요합니다." }, { status: 400 });
    }

    await query(
      `INSERT INTO mobion_channel_reads (user_id, channel_id, last_read_on)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, channel_id) DO UPDATE
         -- never moves backwards: scrolling back to an older message after a
         -- newer one arrived must not resurrect the unread badge
         SET last_read_on = GREATEST(mobion_channel_reads.last_read_on, EXCLUDED.last_read_on)`,
      [user.id, channelId, lastReadOn],
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "읽음 표시에 실패했습니다.");
  }
}
