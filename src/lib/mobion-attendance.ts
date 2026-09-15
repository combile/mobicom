/**
 * Turning a day's raw heartbeat + break rows into what a person sees:
 * when they left (if at all) and how long they actually worked.
 *
 * There is no scheduler in this app — one server, no cron (see the
 * notifications route) — so nothing ever runs "when someone disconnects".
 * Instead `last_seen_at` is overwritten on every poll while someone is
 * connected, and going stale *is* leaving: read back later, a last-seen
 * timestamp older than the lab's own presence threshold is a person who is
 * gone, not a person the server hasn't heard from yet. Wifi dropping or the
 * app quitting look identical to this — both just stop sending heartbeats —
 * which is the point: neither needs its own handling.
 */

/**
 * Same threshold the Lab view uses to decide who is still "here" (see
 * lab/route.ts) — one definition of "connected", used everywhere that needs
 * it, so a person cannot be "in the lab" and "gone for the day" at once.
 */
export const PRESENCE_STALE_MS = 120_000;

export type AttendanceBreakRow = {
  startedAt: string | number | Date;
  endedAt: string | number | Date | null;
};

export type DaySummary = {
  /** Null once the gap since last_seen_at exceeds the presence threshold. */
  leftAt: string | null;
  /** Worked time, in seconds, with every away span subtracted. */
  accumulatedSeconds: number;
  /** An away span with no ended_at yet — toggled on and never toggled off. */
  currentlyAway: boolean;
};

/**
 * `now` is a parameter (not `Date.now()` inline) so this stays a pure
 * function a caller can run against a fixed instant — the self-check below
 * needs that, and so would a test.
 */
export function summarizeDay(
  day: { firstSeenAt: string | number | Date; lastSeenAt: string | number | Date },
  breaks: AttendanceBreakRow[],
  now: number = Date.now(),
): DaySummary {
  const firstSeenMs = new Date(day.firstSeenAt).getTime();
  const lastSeenMs = new Date(day.lastSeenAt).getTime();

  const stale = now - lastSeenMs > PRESENCE_STALE_MS;
  // Still connected: the open-ended "how long so far" clock is `now`. Gone:
  // the clock stopped at the last heartbeat, and that moment is also the
  // answer to "when did they leave".
  const effectiveEnd = stale ? lastSeenMs : now;
  const leftAt = stale ? new Date(lastSeenMs).toISOString() : null;

  let awaySeconds = 0;
  let currentlyAway = false;
  for (const b of breaks) {
    const startedMs = new Date(b.startedAt).getTime();
    const endedMs = b.endedAt === null ? null : new Date(b.endedAt).getTime();
    if (endedMs === null) currentlyAway = true;
    // An away span left open by a disconnect (never toggled back off) does
    // not get to keep growing after the person is already gone — clamp it to
    // the same point their working time stopped counting.
    const end = Math.min(endedMs ?? effectiveEnd, effectiveEnd);
    if (end > startedMs) awaySeconds += (end - startedMs) / 1000;
  }

  const rawSeconds = Math.max(0, (effectiveEnd - firstSeenMs) / 1000);
  const accumulatedSeconds = Math.max(0, rawSeconds - awaySeconds);

  return { leftAt, accumulatedSeconds, currentlyAway };
}

/** "3시간 12분", or "12분" once there is nothing to gain from showing the hour. */
export function formatAccumulated(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h === 0 ? `${m}분` : `${h}시간 ${m}분`;
}

// Runnable self-check (no test framework in this repo — same pattern as
// mobion-mentions.ts). Run with:
//   node --experimental-strip-types src/lib/mobion-attendance.ts
if (typeof process !== "undefined" && process.argv?.[1] && import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import("node:assert")).default as any;

  const T0 = Date.parse("2026-01-01T09:00:00.000Z");
  const hour = 3_600_000;

  // Still connected, no breaks: everything since arriving counts, nothing left.
  {
    const s = summarizeDay(
      { firstSeenAt: T0, lastSeenAt: T0 + hour },
      [],
      T0 + hour,
    );
    assert.strictEqual(s.leftAt, null);
    assert.strictEqual(s.accumulatedSeconds, 3600);
    assert.strictEqual(s.currentlyAway, false);
  }

  // Gone: last heartbeat far enough back that it reads as a departure.
  {
    const s = summarizeDay(
      { firstSeenAt: T0, lastSeenAt: T0 + 4 * hour },
      [],
      T0 + 4 * hour + PRESENCE_STALE_MS + 1000,
    );
    assert.strictEqual(s.leftAt, new Date(T0 + 4 * hour).toISOString());
    assert.strictEqual(s.accumulatedSeconds, 4 * 3600);
  }

  // One closed break of 30 minutes, still connected: subtracted from the total.
  {
    const s = summarizeDay(
      { firstSeenAt: T0, lastSeenAt: T0 + 2 * hour },
      [{ startedAt: T0 + hour, endedAt: T0 + hour + 1_800_000 }],
      T0 + 2 * hour,
    );
    assert.strictEqual(s.accumulatedSeconds, 2 * 3600 - 1800);
    assert.strictEqual(s.currentlyAway, false);
  }

  // Away toggled on and never toggled off, then the connection itself goes
  // stale: the open break must not outlive the moment they actually left, or
  // "away" would eat time that was never being counted as worked anyway.
  {
    const lastSeen = T0 + 2 * hour;
    const s = summarizeDay(
      { firstSeenAt: T0, lastSeenAt: lastSeen },
      [{ startedAt: T0 + hour, endedAt: null }],
      lastSeen + PRESENCE_STALE_MS + 1000,
    );
    assert.strictEqual(s.leftAt, new Date(lastSeen).toISOString());
    // worked 09:00–10:00 only; the open break from 10:00 clamps to leftAt
    assert.strictEqual(s.accumulatedSeconds, 3600);
    assert.strictEqual(s.currentlyAway, true);
  }

  console.log("mobion-attendance self-check passed");
}
