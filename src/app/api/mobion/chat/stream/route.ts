import { requireCurrentUser } from "@/lib/mobion-auth";
import {
  ensureHulyLink,
  getWorkspaceClient,
  CHUNTER_CLASS,
  CORE_CLASS,
  SortingOrder,
} from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type ChunterSpace = {
  _id: string;
  name: string;
  description: string;
  private: boolean;
  members: string[];
};
type ChatMessage = {
  _id: string;
  attachedTo: string;
  message: string;
  createdBy: string;
  createdOn: number;
};
type UserStatusDoc = { _id: string; user: string; online: boolean };

// Shape verified against the live Huly server by Task 1: client.setNotifyHandler(fn)
// calls fn(txes) with a flat array of raw tx objects, NOT wrapped in an outer
// {tx: ...} — see mobion-huly.ts's getWorkspaceClient for the raw.notify wiring.
type RawTx = {
  _class: string;
  objectId: string;
  objectClass: string;
  attachedTo: string;
  createdBy: string;
  createdOn?: number;
  modifiedOn: number;
  attributes?: {
    message?: string;
    name?: string;
    description?: string;
    private?: boolean;
    members?: string[];
    online?: boolean;
    user?: string;
  };
  // Only present on TxUpdateDoc (a DocumentUpdate<T>, i.e. a partial-attribute
  // patch) — TxCreateDoc carries the full doc on `attributes` instead. A
  // UserStatus's `online` flip (an existing doc's field changing, not a new
  // doc being created) arrives here, not on `attributes`. See @hcengineering/core's
  // TxUpdateDoc<T> (operations: DocumentUpdate<T>) vs TxCreateDoc<T> (attributes: Data<T>).
  operations?: {
    online?: boolean;
  };
};

// A single message post fires TxCreateDoc (the message) + TxUpdateDoc (channel
// counter) + TxWorkspaceEvent, sometimes across multiple separate notify() calls
// (plus unrelated UserStatus/Collaborator noise) — only this combination is an
// actual new chat message.
function isNewChatMessage(tx: RawTx) {
  return (
    tx._class === "core:class:TxCreateDoc" &&
    tx.objectClass === CHUNTER_CLASS.ChatMessage
  );
}

function canSeeChannel(channel: { private: boolean; members: string[] }, myAccountUuid: string) {
  return !channel.private || channel.members.includes(myAccountUuid);
}

// A channel-creation tx: same TxCreateDoc shape as a chat message (see
// isNewChatMessage above), but for the Channel class itself, with the full
// Channel doc's fields as attributes instead of just a message string.
function isNewChannel(tx: RawTx) {
  return (
    tx._class === "core:class:TxCreateDoc" &&
    tx.objectClass === CHUNTER_CLASS.Channel
  );
}

// A UserStatus doc's `online` flag can change via either TxCreateDoc (the first
// time this account's status doc is created) or TxUpdateDoc (an existing doc's
// `online` flipping) — unlike chat messages and channels, which only ever
// arrive as TxCreateDoc. The two tx kinds carry the changed field on different
// properties (attributes vs. operations — see RawTx's `operations` comment and
// the notify handler's `online` read below); confirmed against
// @hcengineering/core/src/tx.ts's TxCreateDoc<T>/TxUpdateDoc<T> definitions,
// but not re-confirmed against a live TxUpdateDoc for UserStatus specifically
// (no DM existed between the two test accounts to trigger one — see this
// task's fix report for what static verification was done instead).
function isUserStatusTx(tx: RawTx) {
  return (
    (tx._class === "core:class:TxCreateDoc" || tx._class === "core:class:TxUpdateDoc") &&
    tx.objectClass === CORE_CLASS.UserStatus
  );
}

type AuthorRow = { huly_social_id: string | null; name: string; avatar_url: string | null };

/**
 * How much of each conversation the snapshot carries.
 *
 * Per space rather than as one total: a single busy channel would otherwise
 * consume the whole budget and every other channel would open blank. Older
 * messages are fetched on demand by GET /api/mobion/chat/messages.
 */
const SNAPSHOT_PER_SPACE = 50;

export async function GET() {
  try {
    const user = await requireCurrentUser();

    const encoder = new TextEncoder();
    let closed = false;
    let unsubscribe: (() => void) | undefined;

    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          if (closed) return;
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        }

        // Reported as an in-stream event on a normal 200 response, not a 404 —
        // a non-200 here would make EventSource treat it as a transient
        // connection failure and retry forever with backoff, never showing
        // the user why. See mobion-huly.ts's huly_social_id comment: only the
        // admin-bootstrapped account (created directly in Postgres, bypassing
        // the invite/activate flow) can hit this in practice.
        const link = await ensureHulyLink(user);
        if (!link) {
          send("error", { message: "not_linked" });
          controller.close();
          return;
        }

        let client;
        try {
          client = await getWorkspaceClient(link);
        } catch {
          send("error", { message: "huly_unavailable" });
          controller.close();
          return;
        }

        let channels: ChunterSpace[];
        let dms: ChunterSpace[];
        let authorRows: AuthorRow[];
        try {
          [channels, dms] = await Promise.all([
            client.findAll<ChunterSpace>(CHUNTER_CLASS.Channel, {}),
            client.findAll<ChunterSpace>(CHUNTER_CLASS.DirectMessage, {}),
          ]);
        } catch {
          send("error", { message: "huly_unavailable" });
          controller.close();
          return;
        }
        // Channel.members (unlike ChatMessage.createdBy below, which stays
        // PersonId/primarySocialId throughout) is keyed by AccountUuid — Huly's
        // own server-side space-membership scoping matches on it, confirmed
        // against the live server. See mobion-huly.ts's accountUuid comment.
        const myAccountUuid = client.account.accountUuid;
        const visibleChannels = channels.filter((c) => canSeeChannel(c, myAccountUuid));
        // Tracked for the lifetime of this connection so a later ChatMessage delta
        // can be checked against the channel it belongs to without a re-query —
        // a channel's own privacy doesn't change after creation in this app (no
        // edit-channel feature), so a snapshot-time map stays accurate.
        const channelPrivacy = new Map(
          channels.map((c) => [c._id, { private: c.private, members: c.members }]),
        );

        // Scoped and capped. This previously read every ChatMessage in the
        // workspace with no filter and no limit and shipped the lot to the
        // browser on every connect, so the cost of opening the app grew with
        // the entire history of every conversation — including channels this
        // account cannot even see.
        let messages: ChatMessage[];
        try {
          const perSpace = await Promise.all(
            [...visibleChannels, ...dms].map((space) =>
              client.findAll<ChatMessage>(
                CHUNTER_CLASS.ChatMessage,
                { attachedTo: space._id },
                { limit: SNAPSHOT_PER_SPACE, sort: { createdOn: SortingOrder.Descending } },
              ),
            ),
          );
          // newest-first per space above, so that the limit keeps the recent
          // end; flipped back to reading order before it goes out
          messages = perSpace.flat().sort((a, b) => a.createdOn - b.createdOn);
        } catch {
          send("error", { message: "huly_unavailable" });
          controller.close();
          return;
        }
        // Best-effort, same reasoning as authorRows/tagRows below: a presence
        // lookup failure must never block the stream from opening — DMs just
        // render with no online dot until the next successful snapshot.
        const userStatuses = await client
          .findAll<UserStatusDoc>(CORE_CLASS.UserStatus, {})
          .catch(() => [] as UserStatusDoc[]);
        const onlineByAccountUuid = new Map(userStatuses.map((s) => [s.user, s.online]));
        // Maps a UserStatus doc's own _id back to the AccountUuid it's about —
        // needed because a later TxUpdateDoc's objectId is the status doc's id,
        // not the account it describes. Mutated (via .set) as new UserStatus
        // docs are created, in the notify handler below.
        const statusDocToAccount = new Map(userStatuses.map((s) => [s._id, s.user]));
        // Maps an AccountUuid to the one DM channel (in this connection's own
        // dms list) it's the "other" participant of — this app's DM model is
        // strictly 1:1, so there's at most one match per account.
        const dmByOtherAccount = new Map<string, string>();
        for (const d of dms) {
          const other = d.members.find((m) => m !== myAccountUuid);
          if (other) dmByOtherAccount.set(other, d._id);
        }
        // Best-effort: an author name we can't resolve just falls back to the
        // raw Huly id client-side, it never blocks the stream from opening.
        authorRows = await query<AuthorRow>(
          `SELECT l.huly_social_id, u.name, u.avatar_url
           FROM mobion_huly_link l JOIN mobion_users u ON u.id = l.user_id
           WHERE l.huly_social_id IS NOT NULL`,
        ).then((r) => r.rows).catch(() => []);
        const authorNames = new Map(authorRows.map((r) => [r.huly_social_id, r.name]));
        const authorAvatars = new Map(authorRows.map((r) => [r.huly_social_id, r.avatar_url]));

        // Best-effort, same reasoning as authorRows above: a tag lookup failure
        // must never block the stream from opening, it just means an empty tag
        // list until the next successful snapshot.
        const tagRows = await query<{ channel_id: string; tag: string }>(
          `SELECT channel_id, tag FROM mobion_channel_tags
           WHERE channel_id = ANY($1::text[])`,
          [visibleChannels.map((c) => c._id)],
        ).then((r) => r.rows).catch(() => []);
        const tagsByChannel = new Map<string, string[]>();
        for (const row of tagRows) {
          const list = tagsByChannel.get(row.channel_id) ?? [];
          list.push(row.tag);
          tagsByChannel.set(row.channel_id, list);
        }

        const spaces = [
          ...visibleChannels.map((c) => ({
            id: c._id,
            name: c.name,
            description: c.description,
            tags: tagsByChannel.get(c._id) ?? [],
            kind: "channel" as const,
          })),
          ...dms.map((d) => {
            const other = d.members.find((m) => m !== myAccountUuid);
            return {
              id: d._id,
              name: d.name,
              description: d.description,
              tags: [] as string[],
              kind: "dm" as const,
              online: other ? onlineByAccountUuid.get(other) ?? false : false,
            };
          }),
        ];

        send("snapshot", {
          channels: spaces,
          // tells the client which conversations may have more above the top
          perSpaceLimit: SNAPSHOT_PER_SPACE,
          messages: messages.map((m) => ({
            id: m._id,
            channelId: m.attachedTo,
            text: m.message,
            authorId: m.createdBy,
            authorName: authorNames.get(m.createdBy) ?? null,
            authorAvatarUrl: authorAvatars.get(m.createdBy) ?? null,
            createdOn: m.createdOn,
          })),
        });

        unsubscribe = client.setNotifyHandler((txes) => {
          for (const tx of txes as RawTx[]) {
            if (isNewChannel(tx)) {
              const isPrivate = tx.attributes?.private ?? false;
              const members = tx.attributes?.members ?? [];
              channelPrivacy.set(tx.objectId, { private: isPrivate, members });
              if (!canSeeChannel({ private: isPrivate, members }, myAccountUuid)) continue;
              const channelId = tx.objectId;
              const name = tx.attributes?.name ?? "";
              const description = tx.attributes?.description ?? "";
              // Best-effort, fire-and-forget: a tag lookup here races the creating
              // request's own tag insert (see the design spec's "accepted race").
              // Never await this inline — it must not block delivery of other
              // unrelated tx's in the same notify() batch to this connection.
              query<{ tag: string }>(
                `SELECT tag FROM mobion_channel_tags WHERE channel_id = $1`,
                [channelId],
              )
                .then((r) =>
                  send("channel_added", {
                    id: channelId,
                    name,
                    description,
                    tags: r.rows.map((row) => row.tag),
                    kind: "channel" as const,
                  }),
                )
                .catch(() =>
                  send("channel_added", {
                    id: channelId,
                    name,
                    description,
                    tags: [],
                    kind: "channel" as const,
                  }),
                );
              continue;
            }
            if (isUserStatusTx(tx)) {
              let accountUuid: string | undefined;
              if (tx._class === "core:class:TxCreateDoc") {
                accountUuid = tx.attributes?.user;
                if (accountUuid) statusDocToAccount.set(tx.objectId, accountUuid);
              } else {
                accountUuid = statusDocToAccount.get(tx.objectId);
              }
              if (!accountUuid) continue;
              const dmId = dmByOtherAccount.get(accountUuid);
              if (!dmId) continue; // not a DM partner of this connection
              // TxCreateDoc carries the new doc's fields on `attributes`; TxUpdateDoc
              // (how an existing UserStatus doc's `online` actually flips live)
              // carries only the changed fields on `operations` instead. Reading
              // `attributes` for both meant every live flip after the doc's initial
              // creation was silently dropped by the `undefined` guard below.
              const online =
                tx._class === "core:class:TxCreateDoc"
                  ? tx.attributes?.online
                  : tx.operations?.online;
              if (online === undefined) continue; // this update didn't touch `online`
              send("presence", { channelId: dmId, online });
              continue;
            }
            if (!isNewChatMessage(tx)) continue;
            const owningChannel = channelPrivacy.get(tx.attachedTo);
            // A message in a channel this connection was never told about (created
            // before this connection opened, or a privacy check that somehow
            // missed it) is treated as not visible — fail closed, not open.
            if (!owningChannel || !canSeeChannel(owningChannel, myAccountUuid)) continue;
            send("delta", {
              id: tx.objectId,
              channelId: tx.attachedTo,
              text: tx.attributes?.message ?? "",
              authorId: tx.createdBy,
              authorName: authorNames.get(tx.createdBy) ?? null,
              authorAvatarUrl: authorAvatars.get(tx.createdBy) ?? null,
              // Huly's Doc.createdOn is documented as optional ("filled by
              // platform") — createTxCreateDoc only guarantees modifiedOn.
              // Fall back so message ordering never compares against undefined.
              createdOn: tx.createdOn ?? tx.modifiedOn,
            });
          }
        });
      },
      cancel() {
        closed = true;
        unsubscribe?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return mobionApiError(error, "채팅 스트림 연결 실패");
  }
}
