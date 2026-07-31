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
}

declare module "@hcengineering/account-client" {
  import type { AccountRole } from "@hcengineering/core";

  export interface LoginInfo {
    account: string;
    token?: string;
  }

  export interface WorkspaceLoginInfo extends LoginInfo {
    workspace: string;
    token: string;
  }

  export interface AccountClient {
    login: (email: string, password: string) => Promise<LoginInfo>;
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
