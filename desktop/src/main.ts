import { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } from "electron";
import { join } from "path";
import { loadSettings, saveSettings } from "./settings";
import { shouldNotify } from "./notify-rules";
import type { DesktopNotification } from "./preload";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
// Distinguishes "the user closed the window" (hide) from "the app is really
// quitting" (let it close). Without it, quitting from the tray would just hide
// the window again and the app could never exit.
let isQuitting = false;

function showWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function refreshTrayMenu() {
  if (!tray) return;
  const settings = loadSettings();

  tray.setContextMenu(
    Menu.buildFromTemplate([
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
  // macOS renders a template image in the menu bar's own colour, so it follows
  // light and dark mode instead of staying one fixed shade.
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("Mobi:ON");
  refreshTrayMenu();
  tray.on("click", showWindow);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    title: "Mobi:ON",
    webPreferences: {
      // A remote page is loaded here. Turning either of these off would put
      // that page's scripts in reach of Node.
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void mainWindow.loadURL(loadSettings().serverUrl);

  // Closing hides rather than quits: the renderer holds the SSE connection, so
  // destroying the window would stop notifications — the one thing this app
  // exists to do.
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, description, url) => {
    // -3 is ERR_ABORTED, which ordinary in-app navigation also produces.
    if (code === -3) return;
    console.error("load failed", code, description, url);
    void mainWindow?.loadFile(join(__dirname, "..", "src", "offline.html"));
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// The renderer knows which channel is open and whether the message is its own;
// the main process knows whether the window is focused and what the settings
// say. The decision needs both, so it is made here with the renderer's half
// sent along.
ipcMain.on("mobion:notify", (_event, payload: DesktopNotification) => {
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

void app.whenReady().then(() => {
  createWindow();
  createTray();
});

// macOS keeps apps running with no windows; clicking the dock icon reopens one.
app.on("activate", showWindow);

// Every platform keeps running: a closed window is how this app sits in the
// background, not a signal to exit.
app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  isQuitting = true;
});
