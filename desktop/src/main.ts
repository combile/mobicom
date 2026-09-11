import { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, shell } from "electron";
import { join } from "path";
import { loadSettings, saveSettings } from "./settings";
import { shouldNotify } from "./notify-rules";
import type { DesktopNotification, DesktopNotificationPreview } from "./preload";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
// Distinguishes "the user closed the window" (hide) from "the app is really
// quitting" (let it close). Without it, quitting from the tray would just hide
// the window again and the app could never exit.
let isQuitting = false;
// Prevents did-fail-load from re-triggering a load of the offline page when
// the offline page itself is what failed to load.
let showingOffline = false;
// Most-recent-first, shown at the top of the tray menu. The renderer pushes
// this whenever its own notification poll updates — the shell has no server
// access of its own, so this is the only way it learns anything happened.
let recentNotifications: DesktopNotificationPreview[] = [];
// A local snooze, independent of the "알림 받기" setting: that one is a
// standing preference saved to disk, this is "not right now" for the current
// session. Toggling it off does not touch the saved setting underneath.
let away = false;
const TRAY_NOTIFICATION_ROWS = 5;
// Polls the server while the offline page is up, so a server that comes back
// brings the app back with it. Without this the window sits on an error screen
// until someone notices and presses a button — and the lab server going down
// and up again is an ordinary event here, not a rare one.
let offlineRetryTimer: ReturnType<typeof setInterval> | undefined;
const OFFLINE_RETRY_MS = 5000;

function stopOfflineRetry() {
  if (!offlineRetryTimer) return;
  clearInterval(offlineRetryTimer);
  offlineRetryTimer = undefined;
}

function startOfflineRetry() {
  if (offlineRetryTimer) return;
  offlineRetryTimer = setInterval(async () => {
    const url = loadSettings().serverUrl;
    try {
      // Checked from the main process rather than from the offline page: that
      // page is a file:// document, and a request from it to the server is a
      // cross-origin one the browser would block.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(url, { method: "HEAD", signal: controller.signal });
      clearTimeout(timeout);
      // Any answer at all means something is listening. A 4xx or a redirect is
      // the app talking — only a dead socket keeps us waiting.
      if (res.status > 0) {
        stopOfflineRetry();
        void mainWindow?.loadURL(url);
      }
    } catch {
      // Still down. The next tick will try again.
    }
  }, OFFLINE_RETRY_MS);
}

// A tray-resident app whose window hides on close is easy to forget is
// already running. Without this lock, clicking the icon again launches a
// second instance: a second window, a second tray icon, a second SSE
// connection, and duplicate notifications for every event. The second
// launch quits immediately (and skips the whenReady below, guarded on
// gotLock so a race doesn't still spin up a window before quit finishes);
// "second-instance" below hands off to the window already open in the
// first instance instead.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function showWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Opens the task a recent-notification row points at, same as clicking the notification itself. */
function openNotificationTarget(item: DesktopNotificationPreview) {
  showWindow();
  if (!item.projectId || !item.taskId) return;
  mainWindow?.webContents.send("mobion:open-task", {
    projectId: item.projectId,
    taskId: item.taskId,
    commentId: item.commentId,
  });
}

function refreshTrayMenu() {
  if (!tray) return;
  const settings = loadSettings();

  // A label truncated in the middle of a run of spaces reads as a stray
  // trailing space; trimming after the cut avoids that.
  const notificationRows =
    recentNotifications.length > 0
      ? recentNotifications
          .slice(0, TRAY_NOTIFICATION_ROWS)
          .map((n) => ({
            label: n.label.length > 60 ? `${n.label.slice(0, 60).trimEnd()}…` : n.label,
            click: () => openNotificationTarget(n),
          }))
      : [{ label: "새 알림 없음", enabled: false }];

  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...notificationRows,
      { type: "separator" },
      { label: "열기", click: showWindow },
      {
        label: "알림 받기",
        type: "checkbox",
        checked: settings.notify.enabled,
        click: (item) => {
          saveSettings({ ...settings, notify: { ...settings.notify, enabled: item.checked } });
          refreshTrayMenu();
        },
      },
      {
        label: "자리 비움",
        type: "checkbox",
        checked: away,
        // A standing setting change should not need reopening the menu to
        // see take effect elsewhere, but this one only matters here, so
        // rebuilding the menu is enough — no saveSettings, no disk write.
        click: (item) => {
          away = item.checked;
          refreshTrayMenu();
        },
      },
      // macOS lets someone deny notifications in System Settings, and a denied
      // app is silent with no error. Saying so here is the difference between
      // "this is broken" and "this is switched off over there".
      ...(Notification.isSupported()
        ? []
        : [{ label: "이 시스템에서 알림을 쓸 수 없습니다", enabled: false } as const]),
      { type: "separator" },
      {
        label: "종료",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createTray() {
  const icon = nativeImage.createFromPath(join(__dirname, "..", "build", "tray.png"));
  // Not a template image: template mode throws the colours away and keeps only
  // the alpha, which would turn this icon — a coloured mark on its own dark
  // ground — into a solid black square. The trade is that it no longer follows
  // the menu bar's light/dark shade, which is the right trade for an icon whose
  // colour is the point.
  icon.setTemplateImage(false);

  tray = new Tray(icon);
  tray.setToolTip("Mobicom");
  refreshTrayMenu();
  // No "click" handler: Tray.setContextMenu already opens that menu on a
  // regular click (macOS does not distinguish primary/secondary click for a
  // tray icon the way it does for other UI). A "click" listener here would
  // instead replace that with going straight to the window, which is the
  // behaviour being replaced — the menu is now the click.
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    title: "Mobicom",
    webPreferences: {
      // A remote page is loaded here. Turning either of these off would put
      // that page's scripts in reach of Node.
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void mainWindow.loadURL(loadSettings().serverUrl);

  // A child window (window.open, target=_blank) inherits the parent's
  // webPreferences — so a chat link to a third-party page would open it
  // chrome-less, with no address bar, and that page would receive
  // window.mobion and could raise OS notifications with attacker-chosen text.
  // Every window.open goes to the real browser instead; nothing opens in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Same reasoning for in-page navigation (a link clicked without
  // target=_blank): anywhere outside the configured server's origin goes to
  // the real browser instead of taking over this chrome-less window.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    let allowedOrigin: string;
    try {
      // Read fresh, not cached at startup: settings can change between launches.
      allowedOrigin = new URL(loadSettings().serverUrl).origin;
    } catch {
      // A malformed serverUrl in a hand-edited settings file must not crash
      // the main process — deny the navigation rather than allow it.
      event.preventDefault();
      return;
    }
    let targetOrigin: string;
    try {
      targetOrigin = new URL(url).origin;
    } catch {
      event.preventDefault();
      return;
    }
    if (targetOrigin !== allowedOrigin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Closing hides rather than quits: the renderer holds the SSE connection, so
  // destroying the window would stop notifications — the one thing this app
  // exists to do.
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    // -3 is ERR_ABORTED, which ordinary in-app navigation also produces.
    if (code === -3) return;
    // A failed subresource is not a failed page: a blocked font or missing
    // favicon fires this event too, and it is not the main frame that failed.
    if (!isMainFrame) return;
    // The offline page itself failing to load would re-fire this event and
    // loop back into loading the offline page again.
    if (showingOffline) return;
    console.error("load failed", code, description, url);
    showingOffline = true;
    void mainWindow?.loadFile(join(__dirname, "..", "src", "offline.html"));
    startOfflineRetry();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    showingOffline = false;
    // The offline page fires this event too, so the poll may only stop once
    // what loaded is actually the server.
    if (!mainWindow?.webContents.getURL().startsWith("file://")) {
      stopOfflineRetry();
    }
  });

  mainWindow.on("closed", () => {
    stopOfflineRetry();
    mainWindow = null;
  });
}

// The renderer knows which channel is open and whether the message is its own;
// the main process knows whether the window is focused and what the settings
// say. The decision needs both, so it is made here with the renderer's half
// sent along.
ipcMain.on("mobion:notify", (_event, payload: DesktopNotification) => {
  // Checked ahead of shouldNotify rather than folded into it: away is a
  // session-only override, not one of the saved preferences that function
  // already weighs, and shouldNotify has no way to receive it.
  if (away) return;

  const settings = loadSettings();

  if (
    !shouldNotify({
      kind: payload.kind,
      authorId: payload.authorId,
      channelId: payload.channelId,
      mySocialId: payload.mySocialId,
      activeChannelId: payload.activeChannelId,
      windowFocused: mainWindow?.isFocused() ?? false,
      settings: settings.notify,
    })
  ) {
    return;
  }

  const notification = new Notification({
    title: payload.title,
    body: payload.body,
    silent: false,
  });

  notification.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (payload.channelId) {
      mainWindow.webContents.send("mobion:open-channel", payload.channelId);
    }
  });

  notification.show();
});

ipcMain.on("mobion:badge", (_event, count: number) => {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  // macOS has a dock badge. Windows has a taskbar overlay and wants an image,
  // so the count is shown as a dot instead.
  if (process.platform === "darwin") {
    app.setBadgeCount(n);
    return;
  }
  if (!mainWindow) return;
  if (n === 0) {
    mainWindow.setOverlayIcon(null, "");
    return;
  }
  // nativeImage decodes PNG/JPEG only — it does NOT decode SVG, so building an
  // SVG data URL here silently produces an empty overlay. And Windows overlay
  // icons render at 16x16, too small for a legible number anyway. So the
  // overlay is a static red dot, and the actual count lives in the
  // accessibility description (read by screen readers / shown as a tooltip).
  const label = n > 99 ? "99+" : String(n);
  const image = nativeImage.createFromPath(join(__dirname, "..", "build", "badge.png"));
  mainWindow.setOverlayIcon(image, `읽지 않은 메시지 ${label}개`);
});

ipcMain.on("mobion:notifications-preview", (_event, items: DesktopNotificationPreview[]) => {
  recentNotifications = Array.isArray(items) ? items : [];
  refreshTrayMenu();
});

ipcMain.on("mobion:retry", () => {
  if (!mainWindow) return;
  void mainWindow.loadURL(loadSettings().serverUrl);
});

if (gotLock) {
  void app.whenReady().then(() => {
    createWindow();
    createTray();
  });
}

app.on("second-instance", showWindow);

// macOS keeps apps running with no windows; clicking the dock icon reopens one.
app.on("activate", showWindow);

// Every platform keeps running: a closed window is how this app sits in the
// background, not a signal to exit.
app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  isQuitting = true;
});
