import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

const TITLE_MAX = 200;
const BODY_MAX = 20000;

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
};

type AttachmentRow = {
  id: string;
  filename: string;
  mime: string;
  size: string;
  expires_at: string | null;
  expired: boolean;
};

async function fetchAttachments(documentId: string) {
  const rows = await query<AttachmentRow>(
    `SELECT id, filename, mime, size::text, expires_at,
            (expires_at IS NOT NULL AND expires_at <= now()) AS expired
       FROM mobion_document_attachments
      WHERE document_id = $1
      ORDER BY created_at ASC`,
    [documentId],
  );
  // An expired row is still returned, marked: the document keeps its shape
  // and the reader sees that a file was here rather than a gap they cannot
  // interpret — same reasoning as chat attachments.
  return rows.rows.map((a) => ({
    id: a.id,
    filename: a.filename,
    mime: a.mime,
    size: Number(a.size),
    expiresAt: a.expires_at,
    expired: a.expired,
    url: `/api/mobion/documents/attachments/${a.id}`,
  }));
}

async function toDocument(r: DocumentRow) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
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
    attachments: await fetchAttachments(r.id),
  };
}

async function fetchDocument(id: string) {
  const result = await query<DocumentRow>(
    `SELECT d.id, d.title, d.body, d.project_id, p.name AS project_name, d.category_id,
            d.created_by, cu.name AS created_by_name,
            d.updated_by, uu.name AS updated_by_name,
            d.created_at, d.updated_at, d.archived_at
     FROM mobion_documents d
     LEFT JOIN mobion_projects p ON p.id = d.project_id
     LEFT JOIN mobion_users cu ON cu.id = d.created_by
     LEFT JOIN mobion_users uu ON uu.id = d.updated_by
     WHERE d.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;
    const doc = await fetchDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ document: await toDocument(doc) });
  } catch (error) {
    return mobionApiError(error, "문서를 불러오지 못했습니다.");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();

    // Same caps the create route applies, so an edit cannot smuggle in a
    // value that creating would have rejected.
    const title = body.title != null ? String(body.title).trim().slice(0, TITLE_MAX) : undefined;
    if (title !== undefined && !title) {
      return NextResponse.json({ error: "문서 제목을 입력해 주세요." }, { status: 400 });
    }
    const text = body.body != null ? String(body.body).trim().slice(0, BODY_MAX) : undefined;
    const projectIdProvided = Object.prototype.hasOwnProperty.call(body, "projectId");
    const projectId = projectIdProvided ? (body.projectId ? String(body.projectId) : null) : undefined;
    const categoryIdProvided = Object.prototype.hasOwnProperty.call(body, "categoryId");
    const categoryId = categoryIdProvided ? (body.categoryId ? String(body.categoryId) : null) : undefined;

    if (title === undefined && text === undefined && projectId === undefined && categoryId === undefined) {
      return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
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

    // Fetched first (rather than relying on the UPDATE's row count) so a
    // 404 (no such document) and a 409 (archived) can be told apart —
    // otherwise "0 rows updated" would read as "not found" either way.
    const existing = await fetchDocument(id);
    if (!existing) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }
    if (existing.archived_at) {
      return NextResponse.json(
        { error: "보관된 문서는 수정할 수 없습니다." },
        { status: 409 },
      );
    }

    const result = await query<{ id: string }>(
      `UPDATE mobion_documents SET
         title = COALESCE($2, title),
         body = COALESCE($3, body),
         project_id = CASE WHEN $4::boolean THEN $5::uuid ELSE project_id END,
         category_id = CASE WHEN $6::boolean THEN $7::uuid ELSE category_id END,
         updated_by = $8,
         updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [
        id,
        title ?? null,
        text ?? null,
        projectIdProvided,
        projectId ?? null,
        categoryIdProvided,
        categoryId ?? null,
        user.id,
      ],
    );

    const updated = await fetchDocument(result.rows[0].id);
    return NextResponse.json({ document: updated ? await toDocument(updated) : null });
  } catch (error) {
    return mobionApiError(error, "문서 수정에 실패했습니다.");
  }
}
