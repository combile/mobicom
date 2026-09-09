import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

/**
 * Which message each of these messages is answering.
 *
 * Only the link is returned, not the quoted text: the parent is almost always
 * already on screen (a reply sits near what it answers), so the client draws
 * the quote from the messages it holds. A parent that has scrolled out of the
 * loaded range simply renders without a quote rather than costing a lookup per
 * message.
 */
export async function GET(request: Request) {
  try {
    await requireCurrentUser();
    const url = new URL(request.url);
    const ids = (url.searchParams.get("messageIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);

    if (ids.length === 0) return NextResponse.json({ replies: {} });

    const rows = await query<{ message_id: string; reply_to: string }>(
      `SELECT message_id, reply_to FROM mobion_message_replies
        WHERE message_id = ANY($1::text[])`,
      [ids],
    );

    return NextResponse.json({
      replies: Object.fromEntries(rows.rows.map((r) => [r.message_id, r.reply_to])),
    });
  } catch (error) {
    return mobionApiError(error, "답장 정보를 불러오지 못했습니다.");
  }
}
