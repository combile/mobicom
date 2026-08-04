import { randomBytes } from "crypto";
import { getClient as getAccountClient } from "@hcengineering/account-client";
import { connect } from "@hcengineering/api-client";
import { AccountRole } from "@hcengineering/core";
import { encryptSecret, decryptSecret } from "./mobion-crypto";

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
