import { contextBridge, ipcRenderer } from "electron";

export type DesktopNotification = {
  kind: "message" | "mention" | "task";
  title: string;
  body: string;
  channelId: string | null;
  authorId: string | null;
  // The renderer's half of the decision: which channel is open and who I am.
  // The main process supplies the rest (window focus, settings).
  activeChannelId: string | null;
  mySocialId: string | null;
};

/** One row of the tray's recent-notifications section. See mobion-desktop.ts. */
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

// Only these cross the boundary. The page loaded here is remote, so this
// bridge is the entire surface it can reach — anything added is added to what
// that page can do.
contextBridge.exposeInMainWorld("mobion", {
  notify: (payload: DesktopNotification) => ipcRenderer.send("mobion:notify", payload),
  setBadge: (count: number) => ipcRenderer.send("mobion:badge", count),
  onOpenChannel: (handler: (channelId: string) => void) => {
    const listener = (_e: unknown, channelId: string) => handler(channelId);
    ipcRenderer.on("mobion:open-channel", listener);
    return () => ipcRenderer.removeListener("mobion:open-channel", listener);
  },
  setNotificationsPreview: (items: DesktopNotificationPreview[]) =>
    ipcRenderer.send("mobion:notifications-preview", items),
  onOpenTask: (handler: (target: DesktopTaskTarget) => void) => {
    const listener = (_e: unknown, target: DesktopTaskTarget) => handler(target);
    ipcRenderer.on("mobion:open-task", listener);
    return () => ipcRenderer.removeListener("mobion:open-task", listener);
  },
  // Used only by offline.html's "다시 시도" button — reloading a file:// page
  // reloads itself forever, this asks main to reload the real server URL.
  retry: () => ipcRenderer.send("mobion:retry"),
});
