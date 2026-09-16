import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

const TITLE_MAX = 200;
const BODY_MAX = 20000;
// Enough to give a sense of the document without shipping the whole body to
// a list the user has not opened yet.
const PREVIEW_MAX = 160;

type DocumentRow = {
  id: string;
  title: string;
  body: string;
  project_id: string | null;
  project_name: string | null;
  category_id: string | null;
  created_by: string;
  created_by_name: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  thumbnail_attachment_id: string | null;
  attachment_count: string;
};

function preview(body: string) {
  const trimmed = body.trim();
  return trimmed.length > PREVIEW_MAX ? `${trimmed.slice(0, PREVIEW_MAX)}…` : trimmed;
}

function toDocumentSummary(r: DocumentRow) {
  return {
    id: r.id,
    title: r.title,
    bodyPreview: preview(r.body),
    projectId: r.project_id,
    projectName: r.project_name,
    categoryId: r.category_id,
    createdById: r.created_by,
    createdByName: r.created_by_name,
    updatedById: r.updated_by,
    updatedByName: r.updated_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
    // Only ever an image attachment (see the LATERAL join below) — other
    // file types have no way to render as a small preview image, so the list
    // falls back to attachmentCount for those instead of a broken thumbnail.
    thumbnailUrl: r.thumbnail_attachment_id
      ? `/api/mobion/documents/attachments/${r.thumbnail_attachment_id}`
      : null,
    attachmentCount: Number(r.attachment_count),
  };
}

export async function GET(request: Request) {
  try {
    await requireCurrentUser();
    const params = new URL(request.url).searchParams;
    // "lab" is a sentinel for lab-wide docs (project_id IS NULL), distinct
    // from omitting the filter entirely (which means "any project or none").
    const projectParam = params.get("projectId");
    const createdBy = params.get("createdBy");
    const includeArchived = params.get("includeArchived") === "true";

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (projectParam === "lab") {
      conditions.push(`d.project_id IS NULL`);
    } else if (projectParam) {
      values.push(projectParam);
      conditions.push(`d.project_id = $${values.length}`);
    }

    if (createdBy) {
      values.push(createdBy);
      conditions.push(`d.created_by = $${values.length}`);
    }

    if (!includeArchived) {
      conditions.push(`d.archived_at IS NULL`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // The sidebar tree needs every document at once to build itself (and to
    // filter as someone types a search), so this route is deliberately
    // unpaged — same call this app already made for projects/contests.
    const result = await query<DocumentRow>(
      `SELECT d.id, d.title, d.body, d.project_id, p.name AS project_name, d.category_id,
              d.created_by, cu.name AS created_by_name,
              d.updated_by, uu.name AS updated_by_name,
              d.created_at, d.updated_at, d.archived_at,
              thumb.id AS thumbnail_attachment_id,
              COALESCE(counts.attachment_count, 0) AS attachment_count
       FROM mobion_documents d
       LEFT JOIN mobion_projects p ON p.id = d.project_id
       LEFT JOIN mobion_users cu ON cu.id = d.created_by
       LEFT JOIN mobion_users uu ON uu.id = d.updated_by
       -- earliest live image attachment stands in for the document in the
       -- list; a non-image file (pdf/pptx/...) has nothing to render as an
       -- actual picture, so it is left out here and only counted below
       LEFT JOIN LATERAL (
         SELECT a.id FROM mobion_document_attachments a
         WHERE a.document_id = d.id AND a.mime LIKE 'image/%'
           AND (a.expires_at IS NULL OR a.expires_at > now())
         ORDER BY a.created_at ASC
         LIMIT 1
       ) thumb ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS attachment_count FROM mobion_document_attachments a
         WHERE a.document_id = d.id AND (a.expires_at IS NULL OR a.expires_at > now())
       ) counts ON true
       ${where}
       ORDER BY d.updated_at DESC`,
      values,
    );

    return NextResponse.json({ documents: result.rows.map(toDocumentSummary) });
  } catch (error) {
    return mobionApiError(error, "문서 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const title = String(body.title ?? "").trim().slice(0, TITLE_MAX);
    const text = String(body.body ?? "").trim().slice(0, BODY_MAX);
    const projectId = body.projectId ? String(body.projectId) : null;
    const categoryId = body.categoryId ? String(body.categoryId) : null;

    if (!title) {
      return NextResponse.json({ error: "문서 제목을 입력해 주세요." }, { status: 400 });
    }

    if (projectId) {
      const projectResult = await query<{ id: string }>(
        `SELECT id FROM mobion_projects WHERE id = $1`,
        [projectId],
      );
      if (projectResult.rows.length === 0) {
        return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 400 });
      }
    }

    if (categoryId) {
      const categoryResult = await query<{ id: string }>(
        `SELECT id FROM mobion_document_categories WHERE id = $1`,
        [categoryId],
      );
      if (categoryResult.rows.length === 0) {
        return NextResponse.json({ error: "카테고리를 찾을 수 없습니다." }, { status: 400 });
      }
    }

    const result = await query<{ id: string }>(
      `INSERT INTO mobion_documents (title, body, project_id, category_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [title, text, projectId, categoryId, user.id],
    );

    return NextResponse.json({ document: { id: result.rows[0].id } });
  } catch (error) {
    return mobionApiError(error, "문서 생성에 실패했습니다.");
  }
}
