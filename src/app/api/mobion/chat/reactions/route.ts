import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

/**
 * Emoji reactions on chat messages.
 *
 * Reactions live in this app's own Postgres rather than in Huly. Huly has its
 * own reaction model, but reading it would mean another round trip per message
 * on every snapshot, and the counts here are wanted for messages the snapshot
 * already carries. One row per (message, person, emoji) — the primary key is
 * what makes a double-click idempotent.
 */

// Guards against a client sending a paragraph as an "emoji". Emoji sequences
// with skin tone or ZWJ joiners run longer than one code point, so this is a
// length cap rather than a single-character check.
const MAX_EMOJI_LENGTH = 16;

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const messageId = String(body.messageId ?? "");
    const emoji = String(body.emoji ?? "").trim();

    if (!messageId || !emoji || emoji.length > MAX_EMOJI_LENGTH) {
      return NextResponse.json({ error: "메시지와 이모지가 필요합니다." }, { status: 400 });
    }

    // Toggle: the same person pressing the same emoji twice removes it. Done as
    // delete-then-insert-if-nothing-deleted so the two paths cannot both run.
    const removed = await query(
      `DELETE FROM mobion_message_reactions
        WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, user.id, emoji],
    );

    if (removed.rowCount === 0) {
      await query(
        `INSERT INTO mobion_message_reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [messageId, user.id, emoji],
      );
    }

    const rows = await query<{ emoji: string; count: string; mine: boolean }>(
      `SELECT emoji, count(*)::text AS count,
              bool_or(user_id = $2) AS mine
         FROM mobion_message_reactions
        WHERE message_id = $1
        GROUP BY emoji
        ORDER BY min(created_at)`,
      [messageId, user.id],
    );

    return NextResponse.json({
      messageId,
      reactions: rows.rows.map((r) => ({
        emoji: r.emoji,
        count: Number(r.count),
        mine: r.mine,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "반응을 남기지 못했습니다.");
  }
}

/**
 * Reactions for a set of messages, in one query.
 *
 * Takes ids as a comma-separated list rather than one request per message: a
 * channel opens with fifty messages, and fifty round trips to draw the reaction
 * row under each one is the kind of thing that makes opening a channel slow.
 */
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const ids = (url.searchParams.get("messageIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);

    if (ids.length === 0) return NextResponse.json({ reactions: {} });

    const rows = await query<{
      message_id: string;
      emoji: string;
      count: string;
      mine: boolean;
    }>(
      `SELECT message_id, emoji, count(*)::text AS count,
              bool_or(user_id = $2) AS mine
         FROM mobion_message_reactions
        WHERE message_id = ANY($1::text[])
        GROUP BY message_id, emoji
        ORDER BY min(created_at)`,
      [ids, user.id],
    );

    const byMessage: Record<string, { emoji: string; count: number; mine: boolean }[]> = {};
    for (const r of rows.rows) {
      (byMessage[r.message_id] ??= []).push({
        emoji: r.emoji,
        count: Number(r.count),
        mine: r.mine,
      });
    }

    return NextResponse.json({ reactions: byMessage });
  } catch (error) {
    return mobionApiError(error, "반응을 불러오지 못했습니다.");
  }
}
