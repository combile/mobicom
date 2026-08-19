import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type ContestRow = {
  id: string;
  source: string;
  source_key: string;
  title: string;
  organizer: string;
  url: string;
  deadline: string | null;
  tags: string[];
  collected_at: string;
  interested: boolean;
};

export async function GET() {
  try {
    const user = await requireCurrentUser();

    // Dated postings lead so the ones that can still be acted on come first.
    // Undated ones follow rather than being dropped — unlike the schedule,
    // this list is the record of what was collected.
    const result = await query<ContestRow>(
      `SELECT c.id, c.source, c.source_key, c.title, c.organizer, c.url,
              c.deadline::text AS deadline, c.tags, c.collected_at,
              (i.user_id IS NOT NULL) AS interested
       FROM mobion_contests c
       LEFT JOIN mobion_contest_interests i
         ON i.contest_id = c.id AND i.user_id = $1
       ORDER BY c.deadline IS NULL, c.deadline ASC, c.collected_at DESC`,
      [user.id],
    );

    return NextResponse.json({
      contests: result.rows.map((r) => ({
        id: r.id,
        source: r.source,
        sourceKey: r.source_key,
        title: r.title,
        organizer: r.organizer,
        url: r.url,
        deadline: r.deadline,
        tags: r.tags ?? [],
        collectedAt: r.collected_at,
        interested: r.interested,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "대회 목록을 불러오지 못했습니다.");
  }
}

/**
 * Ingest endpoint for collectors.
 *
 * Deliberately separate from whatever fetches and parses a site: a collector
 * only has to produce this shape, so adding a source means writing a parser
 * rather than touching storage. Re-running one updates what it already stored
 * instead of inserting duplicates — that is what (source, source_key) is for.
 */
export async function POST(request: Request) {
  try {
    await requireCurrentUser();
    const body = await request.json();

    const items = Array.isArray(body.contests) ? body.contests : null;
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "수집 항목이 없습니다." }, { status: 400 });
    }

    let stored = 0;
    for (const raw of items) {
      const source = String(raw.source ?? "").trim().slice(0, 60);
      const sourceKey = String(raw.sourceKey ?? "").trim().slice(0, 200);
      const title = String(raw.title ?? "").trim().slice(0, 300);
      const url = String(raw.url ?? "").trim().slice(0, 500);
      // Every row must be traceable to where it came from, and a posting with
      // no title or link cannot be acted on, so these four are required.
      if (!source || !sourceKey || !title || !url) continue;

      const organizer = String(raw.organizer ?? "").trim().slice(0, 200);
      // Deadlines are often missing or unparseable upstream. Storing null keeps
      // the posting rather than discarding it over a date.
      const deadline =
        typeof raw.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.deadline)
          ? raw.deadline
          : null;
      const tags = Array.isArray(raw.tags)
        ? raw.tags
            .map((t: unknown) => String(t).trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 10)
        : [];

      await query(
        `INSERT INTO mobion_contests (source, source_key, title, organizer, url, deadline, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source, source_key) DO UPDATE SET
           title = EXCLUDED.title,
           organizer = EXCLUDED.organizer,
           url = EXCLUDED.url,
           deadline = EXCLUDED.deadline,
           tags = EXCLUDED.tags,
           collected_at = now()`,
        [source, sourceKey, title, organizer, url, deadline, tags],
      );
      stored += 1;
    }

    return NextResponse.json({ stored, skipped: items.length - stored });
  } catch (error) {
    return mobionApiError(error, "대회 정보를 저장하지 못했습니다.");
  }
}
