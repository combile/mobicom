import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type ResultRow = {
  kind: "project" | "task" | "milestone" | "contest";
  id: string;
  title: string;
  subtitle: string | null;
  project_id: string | null;
  status: string | null;
  url: string | null;
};

/** Per kind, not overall: one crowded kind would otherwise fill the list. */
const PER_KIND = 6;

/**
 * One search across everything the workspace holds.
 *
 * Task search already existed, but it filtered the array the open project had
 * already loaded — so it could not answer "where was that thing", which is the
 * common case, since the answer is usually in a project you are not looking at.
 *
 * Done in SQL rather than by fetching everything and filtering here: the client
 * would have to hold every project's tasks to do the same job, and that is
 * exactly the shape the chat snapshot had to be rescued from.
 */
export async function GET(request: Request) {
  try {
    await requireCurrentUser();
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();

    // one character matches nearly everything, which is noise rather than a
    // result — the palette shows a prompt instead
    if (q.length < 2) return NextResponse.json({ results: [] });

    // escape the LIKE wildcards so a literal % or _ searches for itself
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

    const result = await query<ResultRow>(
      `
      (SELECT 'project' AS kind, p.id::text AS id, p.name AS title,
              NULLIF(p.description, '') AS subtitle,
              p.id::text AS project_id, NULL::text AS status, NULL::text AS url
       FROM mobion_projects p
       WHERE p.name ILIKE $1 OR p.description ILIKE $1
       -- a hit in the name beats a hit in the body text
       ORDER BY (p.name ILIKE $1) DESC, p.name
       LIMIT $2)

      UNION ALL

      (SELECT 'contest', c.id::text, c.title, NULLIF(c.organizer, ''),
              NULL::text, NULL::text, c.url
       FROM mobion_contests c
       WHERE c.title ILIKE $1 OR c.organizer ILIKE $1
       ORDER BY c.deadline NULLS LAST
       LIMIT $2)

      UNION ALL

      (SELECT 'milestone', m.id::text, m.title, p.name,
              m.project_id::text, m.status, NULL::text
       FROM mobion_milestones m
       JOIN mobion_projects p ON p.id = m.project_id
       WHERE m.title ILIKE $1
       ORDER BY m.target_date NULLS LAST
       LIMIT $2)

      UNION ALL

      (SELECT 'task', t.id::text, t.title, p.name,
              t.project_id::text, t.status, NULL::text
       FROM mobion_tasks t
       JOIN mobion_projects p ON p.id = t.project_id
       WHERE t.title ILIKE $1 OR t.description ILIKE $1
       -- title hits first, then unfinished work: a search is usually looking
       -- for something to act on, not something already closed
       ORDER BY (t.title ILIKE $1) DESC, (t.status = 'done'), t.created_at DESC
       LIMIT $2)
      `,
      [like, PER_KIND],
    );

    return NextResponse.json({
      results: result.rows.map((r) => ({
        kind: r.kind,
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        projectId: r.project_id,
        status: r.status,
        url: r.url,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "검색에 실패했습니다.");
  }
}
