import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import { join } from "path";
import { requireCurrentUser } from "@/lib/mobion-auth";
import {
  ensureHulyLink,
  getWorkspaceClient,
  CHUNTER_CLASS,
  HULY_CORE_SPACE,
  canSeeChannel,
  findChannelForAccess,
} from "@/lib/mobion-huly";
import { uploadDir } from "@/lib/mobion-uploads";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const isPrivate = Boolean(body.isPrivate);
    const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
    const visibleToProfessor = Boolean(body.visibleToProfessor);
    const description = String(body.description ?? "").trim().slice(0, 200);
    const tags: string[] = Array.isArray(body.tags)
      ? [...new Set((body.tags as unknown[]).map((t: unknown) => String(t).trim()).filter(Boolean))]
          .slice(0, 10)
          .map((t) => t.slice(0, 30))
      : [];

    if (!name) {
      return NextResponse.json({ error: "채널 이름을 입력해 주세요." }, { status: 400 });
    }

    // provisions on first use, so an account activated while Huly was down is
    // not stuck without chat forever
    const link = await ensureHulyLink(user);
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }

    const client = await getWorkspaceClient(link);

    const existing = await client.findAll<{ _id: string }>(CHUNTER_CLASS.Channel, { name });
    if (existing.length > 0) {
      return NextResponse.json({ error: "중복된 채널 이름입니다." }, { status: 409 });
    }

    // Use the live connection's own identity, not link.huly_account_uuid — that DB
    // column is only backfilled as a side effect of getWorkspaceClient's first-ever
    // call for this account (see mobion-huly.ts), so a freshly-linked account that's
    // never hit a Huly-touching endpoint before would still have it NULL here even
    // though the client connection above just succeeded. The column stays correct
    // for resolving OTHER users below, since they aren't connected in this request.
    let members: string[] = [client.account.accountUuid];
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
           WHERE u.role = 'professor' AND l.huly_account_uuid IS NOT NULL
           LIMIT 1`,
        );
        const professorAccountUuid = professorRow.rows[0]?.huly_account_uuid;
        if (professorAccountUuid) members.push(professorAccountUuid);
      }
      members = [...new Set(members)];
    } else {
      members = [];
    }

    const channelId = await client.createDoc({
      _class: CHUNTER_CLASS.Channel,
      space: HULY_CORE_SPACE,
      attributes: {
        name,
        description,
        private: isPrivate,
        members,
        archived: false,
        topic: "",
      },
    });

    if (tags.length > 0) {
      await query(
        `INSERT INTO mobion_channel_tags (channel_id, tag)
         SELECT $1, tag FROM unnest($2::text[]) AS tag
         ON CONFLICT DO NOTHING`,
        [channelId, tags],
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "채널 생성 실패");
  }
}

// Removing a conversation means removing every message in it, and a busy
// channel can hold thousands. Deleted in pages so one request neither loads
// them all at once nor runs unbounded; the loop stops when a page comes back
// short, which is how the last page announces itself.
const DELETE_PAGE = 200;

/**
 * Deletes a channel or a DM, and everything that belonged to it.
 *
 * Who may: for a channel, its creator or a lab lead, matching message deletion.
 * For a DM, either participant — there is no "creator" worth the name, and a
 * lead has no claim on a private conversation between two other people.
 *
 * Everything goes: messages, reactions, reply links, read marks, pins, and the
 * uploaded files — both their rows and their bytes. A "deleted" conversation
 * whose files still sat on disk would be the kind of half-state nobody can
 * explain a year later.
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const channelId = String(url.searchParams.get("channelId") ?? "");
    if (!channelId) {
      return NextResponse.json({ error: "채널이 필요합니다." }, { status: 400 });
    }

    const link = await ensureHulyLink(user);
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }
    const client = await getWorkspaceClient(link);

    const me = client.account.accountUuid;
    const asChannel = await findChannelForAccess(client, CHUNTER_CLASS.Channel, channelId);
    const target =
      asChannel ?? (await findChannelForAccess(client, CHUNTER_CLASS.DirectMessage, channelId));

    if (!target) {
      return NextResponse.json({ error: "채널을 찾을 수 없습니다." }, { status: 404 });
    }

    if (asChannel) {
      if (!canSeeChannel(asChannel, me)) {
        return NextResponse.json({ error: "채널을 찾을 수 없습니다." }, { status: 404 });
      }
      const createdBy = (asChannel as { createdBy?: string }).createdBy;
      if (createdBy !== client.account.primarySocialId && user.role !== "lead") {
        return NextResponse.json(
          { error: "채널을 만든 사람이나 랩장만 삭제할 수 있습니다." },
          { status: 403 },
        );
      }
    } else {
      // A DM has no creator worth speaking of — both people own the
      // conversation equally, so either may delete it. A lab lead has no
      // special claim here: a private conversation between two other people is
      // not theirs to remove.
      if (!(target.members ?? []).includes(me)) {
        return NextResponse.json({ error: "채널을 찾을 수 없습니다." }, { status: 404 });
      }
    }

    // Files first: their bytes are the only part that cannot be recovered by
    // looking somewhere else, so they are removed while the rows still say
    // where they are.
    const files = await query<{ storage_path: string }>(
      `DELETE FROM mobion_attachments WHERE channel_id = $1 AND storage_path <> ''
       RETURNING storage_path`,
      [channelId],
    );
    const dir = await uploadDir();
    for (const f of files.rows) {
      await unlink(join(dir, f.storage_path)).catch(() => {});
    }

    // Messages, a page at a time.
    for (;;) {
      const batch = await client.findAll<{ _id: string }>(
        CHUNTER_CLASS.ChatMessage,
        { attachedTo: channelId },
        { limit: DELETE_PAGE },
      );
      if (batch.length === 0) break;

      const ids = batch.map((m) => m._id);
      for (const id of ids) {
        await client.removeDoc({
          _class: CHUNTER_CLASS.ChatMessage,
          space: HULY_CORE_SPACE,
          objectId: id,
        });
      }
      await query(`DELETE FROM mobion_message_reactions WHERE message_id = ANY($1::text[])`, [ids]);
      await query(
        `DELETE FROM mobion_message_replies WHERE message_id = ANY($1::text[]) OR reply_to = ANY($1::text[])`,
        [ids],
      );

      if (batch.length < DELETE_PAGE) break;
    }

    await client.removeDoc({
      _class: asChannel ? CHUNTER_CLASS.Channel : CHUNTER_CLASS.DirectMessage,
      space: HULY_CORE_SPACE,
      objectId: channelId,
    });

    await query(`DELETE FROM mobion_channel_tags WHERE channel_id = $1`, [channelId]);
    await query(`DELETE FROM mobion_channel_reads WHERE channel_id = $1`, [channelId]);
    await query(`DELETE FROM mobion_channel_favorites WHERE channel_id = $1`, [channelId]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "채널을 삭제하지 못했습니다.");
  }
}
