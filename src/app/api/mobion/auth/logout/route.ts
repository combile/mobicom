import { NextResponse } from "next/server";
import { clearSession, getCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

export async function POST() {
  // Read before clearing: clearSession only has the cookie, not who it
  // belonged to, and presence is keyed by user id.
  const user = await getCurrentUser();
  await clearSession();

  // Logging out ends the session everywhere it was used, not just this tab
  // — so, unlike a tab simply closing, it is safe to drop presence right
  // away instead of waiting for the heartbeat to go stale.
  if (user) {
    await query(`DELETE FROM mobion_presence WHERE user_id = $1`, [user.id]).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
