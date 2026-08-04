import { randomBytes } from "crypto";
import { getClient as getAccountClient } from "@hcengineering/account-client";
import { connect } from "@hcengineering/api-client";
import getClientResources from "@hcengineering/client-resources";
import { AccountRole, TxOperations } from "@hcengineering/core";
import { encryptSecret, decryptSecret } from "./mobion-crypto";
import { query } from "./mobion-db";

// Hand-picked chunter class IDs instead of depending on @hcengineering/chunter,
// which pulls in @hcengineering/ui + @hcengineering/workbench (Huly's own
// Svelte frontend) for three string constants. Huly's plugin() helper
// (node_modules/@hcengineering/platform/lib/platform.js) generates IDs as
// `${pluginId}:${category}:${Key}`, so these are exact and stable as long as
// chunter's plugin id ('chunter') and class key names don't change upstream.
export const CHUNTER_CLASS = {
  Channel: "chunter:class:Channel",
  DirectMessage: "chunter:class:DirectMessage",
  ChatMessage: "chunter:class:ChatMessage",
} as const;

// Not a chunter-specific value — this is core's own top-level container id that every
// ChunterSpace-derived doc (Channel, DirectMessage) lives under, verified against the
// live server via `findAll` on a real Channel doc. Distinct from `attachedTo`, which is
// the actual channel/DM id a message belongs to (what Task 2's SSE route filters by).
// Using the channel's own id here instead breaks live delta delivery to other users —
// verified during Task 2 review.
export const HULY_CORE_SPACE = "core:space:Space";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// NOTE: HULY_ACCOUNTS_URL is a separate env var from HULY_URL; connect() (used by
// pingAsUser) derives its own accounts URL from HULY_URL/config.json internally. If
// these ever point at different account services, provisioning and pinging will
// silently target different backends. Keep them in sync at deploy time.
async function getAdminClient() {
  const accountsUrl = env("HULY_ACCOUNTS_URL");
  const anon = getAccountClient(accountsUrl);
  const admin = await anon.login(env("HULY_ADMIN_EMAIL"), env("HULY_ADMIN_PASSWORD"));
  if (!admin.token) throw new Error("Huly admin login did not return a token");
  // createInviteLink is workspace-scoped: it operates on whatever workspace the
  // caller's token is bound to. The plain account-level login token above has no
  // workspace selected, so it must be exchanged for a workspace-scoped token first.
  const workspaceClient = getAccountClient(accountsUrl, admin.token);
  const workspaceLogin = await workspaceClient.selectWorkspace(env("HULY_WORKSPACE_URL"));
  return getAccountClient(accountsUrl, workspaceLogin.token);
}

/**
 * Creates a Huly account for a newly-activated lab member and adds them to the
 * lab's single workspace. Returns the credential to store (encrypted) in
 * mobion_huly_link.
 *
 * We store the generated PASSWORD, not the session token `signUpJoin` returns.
 * Tokens may be short-lived (unconfirmed until Task 9's live server is up);
 * a stored password lets pingAsUser (and every later per-user call) always
 * establish a fresh authenticated session via connect()'s password auth,
 * with no separate token-refresh path to maintain.
 */
export async function provisionHulyAccount(email: string, name: string) {
  const admin = await getAdminClient();
  const workspaceUrl = env("HULY_WORKSPACE_URL");
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(" ") || firstName;

  // autoJoin must stay false: the server only honors autoJoin for requests
  // carrying a service-level "schedule" token (server/account/src/operations.ts,
  // createInviteLink -> verifyAllowedServices(['schedule'], extra)), which a normal
  // admin/owner login never has. signUpJoin below works the same either way since we
  // pass firstName/lastName to it directly.
  const inviteLink = await admin.createInviteLink(
    email,
    AccountRole.User,
    false, // autoJoin
    firstName,
    lastName,
  );
  // createInviteLink returns a full navigable URL (/login/join?inviteId=...), not
  // the bare id signUpJoin expects.
  const inviteId = new URL(inviteLink, env("HULY_URL")).searchParams.get("inviteId");
  if (!inviteId) throw new Error("Huly invite link did not contain an inviteId");

  const password = randomBytes(24).toString("base64url");
  const anon = getAccountClient(env("HULY_ACCOUNTS_URL"));
  await anon.signUpJoin(email, password, firstName, lastName, inviteId, workspaceUrl);

  return {
    huly_account_email: email,
    huly_credential_encrypted: encryptSecret(password),
    huly_workspace: workspaceUrl,
  };
}

type HulyLink = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
};

/** Connects as the linked user and runs a trivial read, to prove the bridge works. */
export async function pingAsUser(link: HulyLink): Promise<boolean> {
  const password = decryptSecret(link.huly_credential_encrypted);
  let client;
  try {
    client = await connect(env("HULY_URL"), {
      email: link.huly_account_email,
      password,
      workspace: link.huly_workspace,
      connectionTimeout: 10_000,
    });
    await client.getAccount();
    return true;
  } catch {
    return false;
  } finally {
    await client?.close();
  }
}

const workspaceClients = new Map<string, ReturnType<typeof buildWorkspaceClient>>();

export type HulyWorkspaceClient = Awaited<ReturnType<typeof buildWorkspaceClient>>;

/**
 * Connects as the linked user via the low-level client-resources Client
 * (not api-client's connect()), because only this layer exposes a settable
 * `notify` hook for live tx updates — api-client's PlatformClient wraps it
 * privately and doesn't re-expose it. Cached per email: repeated calls (one
 * per SSE connection, one per send-message request) reuse the same live
 * connection instead of opening a new one each time.
 */
export async function getWorkspaceClient(link: HulyLink): Promise<HulyWorkspaceClient> {
  const cached = workspaceClients.get(link.huly_account_email);
  if (cached) return cached;
  const built = buildWorkspaceClient(link);
  workspaceClients.set(link.huly_account_email, built);
  // Evict on failure so a transient login/network blip doesn't permanently poison
  // the cache — every later call for this email would otherwise keep returning the
  // same dead rejected promise for the life of the process.
  built.catch(() => workspaceClients.delete(link.huly_account_email));
  return built;
}

async function buildWorkspaceClient(link: HulyLink) {
  const password = decryptSecret(link.huly_credential_encrypted);
  const accountsUrl = env("HULY_ACCOUNTS_URL");
  const anon = getAccountClient(accountsUrl);
  const login = await anon.login(link.huly_account_email, password);
  if (!login.token) throw new Error("Huly login did not return a token");
  // login.socialId (a PersonId, e.g. "1198526728507326465") is what TxOperations needs
  // as its `user` — NOT wsLogin.account (an AccountUuid). Verified against the live
  // server: passing wsLogin.account throws platform:status:AccountMismatch on the
  // first tx. selectWorkspace's response doesn't carry socialId even though its type
  // extends LoginInfo, so it must be captured from this earlier plain login() call.
  if (!login.socialId) throw new Error("Huly login did not return a socialId");
  // Best-effort backfill: only known once we've actually logged into Huly, so it
  // can't be captured at provisioning time. Lets the chat UI resolve a message's
  // Huly-side author id back to a mobion_users.name. Not awaited-critical — a
  // failure here shouldn't break the connection itself.
  void query(
    `UPDATE mobion_huly_link SET huly_social_id = $1
     WHERE huly_account_email = $2 AND huly_social_id IS DISTINCT FROM $1`,
    [login.socialId, link.huly_account_email],
  ).catch(() => {});
  const wsClient = getAccountClient(accountsUrl, login.token);
  const wsLogin = await wsClient.selectWorkspace(link.huly_workspace);

  const resources = await getClientResources();
  const raw = await resources.function.GetClient(wsLogin.token, wsLogin.endpoint);
  const tx = new TxOperations(raw as any, login.socialId as any);

  // raw.notify is a single mutable slot, not a subscriber list — the client
  // is cached per email (see getWorkspaceClient above), so two simultaneous
  // callers for the same user (two browser tabs, or a reconnect racing an
  // old connection's teardown) would otherwise stomp on each other's handler.
  // Fan out to a listener set instead, so each caller gets its own
  // register/unsubscribe pair without affecting the others.
  const listeners = new Set<(txes: unknown[]) => void>();
  raw.notify = (...txes: unknown[]) => {
    // notify() is invoked from inside an un-awaited internal promise
    // (core/client.ts's updateFromRemote, called fire-and-forget). A listener
    // that throws synchronously here becomes an unhandled rejection, which
    // exits the Node process by default — one bad SSE write (e.g. a closed
    // controller) would take the whole server down for every user. Isolate
    // each listener so one failing tab can't do that.
    for (const fn of listeners) {
      try {
        fn(txes);
      } catch {
        // swallow — a single listener's failure must not break the others
        // or crash the process.
      }
    }
  };

  function evictOnFailure<T>(promise: Promise<T>): Promise<T> {
    // A Huly restart or expired session leaves this cached client resolved
    // but dead — every call would otherwise fail forever until the Next.js
    // process itself restarts. Evict on the first real-operation failure so
    // the next getWorkspaceClient call rebuilds a fresh connection.
    return promise.catch((error) => {
      workspaceClients.delete(link.huly_account_email);
      throw error;
    });
  }

  return {
    findAll: <T,>(_class: string, query: Record<string, unknown>) =>
      evictOnFailure(raw.findAll<T>(_class as any, query as any)),
    addCollection: (params: {
      _class: string;
      space: string;
      attachedTo: string;
      attachedToClass: string;
      collection: string;
      attributes: Record<string, unknown>;
    }) =>
      evictOnFailure(
        tx.addCollection(
          params._class as any,
          params.space as any,
          params.attachedTo as any,
          params.attachedToClass as any,
          params.collection,
          params.attributes as any,
        ),
      ),
    // accountUuid (wsLogin.account) is Huly's own membership-check identity for
    // Space.members (Channel.members included) — confirmed against the live
    // server: pre-existing channels' members arrays are AccountUuid-formatted,
    // and findAll's own server-side space scoping matches on it, not on
    // primarySocialId. Do NOT use it for TxOperations's `user` param (see the
    // AccountMismatch comment above) or for ChatMessage.createdBy comparisons
    // (those are PersonId, i.e. primarySocialId, throughout).
    account: { primarySocialId: login.socialId, accountUuid: wsLogin.account },
    // Returns an unsubscribe function so each caller (e.g. one SSE
    // connection's cancel()) can remove exactly its own listener instead of
    // clobbering whatever the previous caller registered.
    setNotifyHandler: (fn: (txes: unknown[]) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close: () => raw.close(),
  };
}
