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

// Only these three cross the boundary. The page loaded here is remote, so this
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
});
