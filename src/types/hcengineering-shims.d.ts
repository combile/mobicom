// Workaround for an upstream gap: installed @hcengineering/* packages (v0.7.423) declare
// "types": "types/index.d.ts" in package.json but don't actually ship that file — this
// re-declares only the exports src/lib/mobion-huly.ts uses, matching the real installed
// source (node_modules/@hcengineering/*/src/*.ts) exactly.

declare module "@hcengineering/core" {
  export enum AccountRole {
    ReadOnlyGuest = "READONLYGUEST",
    DocGuest = "DocGuest",
    Guest = "GUEST",
    User = "USER",
    Maintainer = "MAINTAINER",
    Owner = "OWNER",
    Admin = "ADMIN",
  }

  // Minimal surface of the real class (node_modules/@hcengineering/core/src/operations.ts) —
  // only the constructor + addCollection overload getWorkspaceClient uses. Params are
  // loosely typed (unknown/string) because mobion-huly.ts casts through `as any` at the
  // call site rather than importing the full Doc/Ref/Class/Space generic machinery.
  export class TxOperations {
    constructor(client: unknown, user: unknown, isDerived?: boolean);
    addCollection: (
      _class: unknown,
      space: unknown,
      attachedTo: unknown,
      attachedToClass: unknown,
      collection: string,
      attributes: Record<string, unknown>,
      id?: unknown,
      modifiedOn?: number,
      modifiedBy?: unknown,
    ) => Promise<string>;
  }
}

declare module "@hcengineering/account-client" {
  import type { AccountRole } from "@hcengineering/core";

  export interface LoginInfo {
    account: string;
    token?: string;
    // PersonId — the `user` TxOperations expects, distinct from `account` (an
    // AccountUuid). Only present on the plain login() response, not on
    // selectWorkspace's WorkspaceLoginInfo despite the type extending LoginInfo;
    // callers must capture it here. See getWorkspaceClient in mobion-huly.ts.
    socialId?: string;
  }

  export interface WorkspaceLoginInfo extends LoginInfo {
    workspace: string;
    token: string;
    // Transactor URL to hand to client-resources' GetClient(token, endpoint) —
    // present on the real response (account-client/src/types.ts) but omitted
    // from the original shim, which only covered pingAsUser's needs.
    endpoint: string;
  }

  export interface AccountClient {
    login: (email: string, password: string) => Promise<LoginInfo>;
    selectWorkspace: (
      workspaceUrl: string,
      kind?: "external" | "internal" | "byregion",
      externalRegions?: string[],
    ) => Promise<WorkspaceLoginInfo>;
    createInviteLink: (
      email: string,
      role: AccountRole,
      autoJoin: boolean,
      firstName: string,
      lastName: string,
      navigateUrl?: string,
      expHours?: number,
    ) => Promise<string>;
    signUpJoin: (
      email: string,
      password: string,
      first: string,
      last: string,
      inviteId: string,
      workspaceUrl: string,
    ) => Promise<WorkspaceLoginInfo>;
  }

  export function getClient(accountsUrl?: string, token?: string, retryTimeoutMs?: number): AccountClient;
}

declare module "@hcengineering/api-client" {
  export interface ConnectOptions {
    email: string;
    password: string;
    workspace: string;
    /** How long to wait for the connection before timing out, in milliseconds. */
    connectionTimeout?: number;
  }

  export interface PlatformClient {
    getAccount: () => Promise<unknown>;
    close: () => Promise<void>;
  }

  export function connect(url: string, options: ConnectOptions): Promise<PlatformClient>;
}

declare module "@hcengineering/client-resources" {
  export interface RawClient {
    findAll: <T>(_class: string, query: Record<string, unknown>) => Promise<T[]>;
    findOne: <T>(_class: string, query: Record<string, unknown>) => Promise<T | undefined>;
    close: () => Promise<void>;
    notify?: (...tx: unknown[]) => void;
  }
  export interface ClientFactoryOptions {
    onUpgrade?: () => void;
  }
  const clientResources: () => Promise<{
    function: {
      GetClient: (token: string, endpoint: string, opt?: ClientFactoryOptions) => Promise<RawClient>;
    };
  }>;
  export default clientResources;
}
