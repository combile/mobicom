import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import {
  ensureHulyLink,
  getWorkspaceClient,
  CHUNTER_CLASS,
  HULY_CORE_SPACE,
} from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type DmSpace = { _id: string; members?: string[] };

/**
 * Opens a direct message with one other person.
 *
 * Chat could already read and post to DMs — the stream lists them, messages
 * route by `channelClass: "dm"`, and access is judged on the participant list.
 * The one thing missing was a way to start one, so the only DMs anyone had
 * were whatever Huly happened to contain.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const otherUserId = String(body.userId ?? "");

    if (!otherUserId) {
      return NextResponse.json({ error: "상대를 선택해 주세요." }, { status: 400 });
    }
    if (otherUserId === user.id) {
      return NextResponse.json({ error: "자신과는 대화할 수 없습니다." }, { status: 400 });
    }

    const other = await query<{ name: string; huly_account_uuid: string | null }>(
      `SELECT u.name, l.huly_account_uuid
         FROM mobion_users u
         LEFT JOIN mobion_huly_link l ON l.user_id = u.id
        WHERE u.id = $1`,
      [otherUserId],
    );
    const target = other.rows[0];
    if (!target) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }
    if (!target.huly_account_uuid) {
      // Signup succeeds even when Huly is down, so an account can exist here
      // with no Huly side yet. It gets linked on that person's first chat
      // request — until then there is nobody to open a conversation with.
      return NextResponse.json(
        { error: `${target.name} 님은 아직 채팅이 연결되지 않았습니다.` },
        { status: 409 },
      );
    }

    const link = await ensureHulyLink(user);
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }
    const client = await getWorkspaceClient(link);
    const me = client.account.accountUuid;

    // Reuse an existing conversation rather than opening a second one. Two DMs
    // with the same person split the history in half, and nobody can tell which
    // half they wrote in.
    const existing = await client.findAll<DmSpace>(CHUNTER_CLASS.DirectMessage, {});
    const already = existing.find((dm) => {
      const members = dm.members ?? [];
      return (
        members.length === 2 &&
        members.includes(me) &&
        members.includes(target.huly_account_uuid as string)
      );
    });
    if (already) {
      return NextResponse.json({ channelId: already._id, existing: true });
    }

    const channelId = await client.createDoc({
      _class: CHUNTER_CLASS.DirectMessage,
      space: HULY_CORE_SPACE,
      attributes: {
        // A DM has no name of its own — the client shows the other person's.
        // Huly derives the label from members, so leaving this empty is
        // correct rather than lazy.
        name: "",
        description: "",
        private: true,
        members: [me, target.huly_account_uuid],
        archived: false,
      },
    });

    return NextResponse.json({ channelId: String(channelId), existing: false });
  } catch (error) {
    return mobionApiError(error, "대화를 시작하지 못했습니다.");
  }
}
