import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { getWorkspaceClient, CHUNTER_CLASS, HULY_CORE_SPACE } from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type HulyLinkRow = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
  huly_account_uuid: string | null;
};

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const isPrivate = Boolean(body.isPrivate);
    const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
    const visibleToProfessor = Boolean(body.visibleToProfessor);

    if (!name) {
      return NextResponse.json({ error: "채널 이름을 입력해 주세요." }, { status: 400 });
    }

    const linkResult = await query<HulyLinkRow>(
      `SELECT huly_account_email, huly_credential_encrypted, huly_workspace, huly_account_uuid
       FROM mobion_huly_link WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    const link = linkResult.rows[0];
    if (!link || !link.huly_account_uuid) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }

    const client = await getWorkspaceClient(link);

    const existing = await client.findAll<{ _id: string }>(CHUNTER_CLASS.Channel, { name });
    if (existing.length > 0) {
      return NextResponse.json({ error: "중복된 채널 이름입니다." }, { status: 409 });
    }

    let members: string[] = [link.huly_account_uuid];
    if (isPrivate) {
      if (memberIds.length > 0) {
        const memberRows = await query<{ huly_account_uuid: string | null }>(
          `SELECT l.huly_account_uuid
           FROM mobion_huly_link l
           WHERE l.user_id = ANY($1::uuid[]) AND l.huly_account_uuid IS NOT NULL`,
          [memberIds],
        );
        members.push(...memberRows.rows.map((r) => r.huly_account_uuid as string));
      }
      if (visibleToProfessor) {
        const professorRow = await query<{ huly_account_uuid: string | null }>(
          `SELECT l.huly_account_uuid
           FROM mobion_users u
           JOIN mobion_huly_link l ON l.user_id = u.id
           WHERE u.is_professor = true AND l.huly_account_uuid IS NOT NULL
           LIMIT 1`,
        );
        const professorSocialId = professorRow.rows[0]?.huly_account_uuid;
        if (professorSocialId) members.push(professorSocialId);
      }
      members = [...new Set(members)];
    } else {
      members = [];
    }

    await client.createDoc({
      _class: CHUNTER_CLASS.Channel,
      space: HULY_CORE_SPACE,
      attributes: {
        name,
        description: "",
        private: isPrivate,
        members,
        archived: false,
        topic: "",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "채널 생성 실패");
  }
}
