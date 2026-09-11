/**
 * The desktop bridge, as the web app sees it.
 *
 * Every function here is a no-op in a browser. The same app is served to both,
 * and the alternative — checking for the bridge at each call site — puts the
 * same guard in every place that wants to notify.
 */

export type DesktopNotification = {
  kind: "message" | "mention" | "task";
  title: string;
  body: string;
  channelId: string | null;
  authorId: string | null;
  activeChannelId: string | null;
  mySocialId: string | null;
};

/**
 * One row of the tray's recent-notifications section.
 *
 * `label` arrives pre-formatted — the shell has no access to
 * mobion-notifications.ts (a separate build, no shared import path), so the
 * web app renders the same text the in-app tray already shows rather than
 * have the shell reinvent that formatting.
 */
export type DesktopNotificationPreview = {
  id: string;
  label: string;
  projectId: string | null;
  taskId: string | null;
  commentId: string | null;
};

export type DesktopTaskTarget = {
  projectId: string;
  taskId: string;
  commentId: string | null;
};

type MobionBridge = {
  notify: (payload: DesktopNotification) => void;
  setBadge: (count: number) => void;
  onOpenChannel: (handler: (channelId: string) => void) => () => void;
  setNotificationsPreview: (items: DesktopNotificationPreview[]) => void;
  onOpenTask: (handler: (target: DesktopTaskTarget) => void) => () => void;
};

function bridge(): MobionBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { mobion?: MobionBridge }).mobion ?? null;
}

/** True when running inside the desktop shell. */
export function isDesktop(): boolean {
  return bridge() !== null;
}

export function notifyDesktop(payload: DesktopNotification): void {
  bridge()?.notify(payload);
}

export function setDesktopBadge(count: number): void {
  bridge()?.setBadge(count);
}

/** Returns an unsubscribe function; safe to call in a browser (no-op). */
export function onDesktopChannelOpen(handler: (channelId: string) => void): () => void {
  return bridge()?.onOpenChannel(handler) ?? (() => {});
}

/**
 * Recent notifications for the tray menu, most recent first. The shell caps
 * how many it actually shows — sending a few extra costs nothing here.
 */
export function setDesktopNotificationsPreview(items: DesktopNotificationPreview[]): void {
  bridge()?.setNotificationsPreview(items);
}

/** Returns an unsubscribe function; safe to call in a browser (no-op). */
export function onDesktopOpenTask(handler: (target: DesktopTaskTarget) => void): () => void {
  return bridge()?.onOpenTask(handler) ?? (() => {});
}
