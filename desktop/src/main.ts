import { app, BrowserWindow, ipcMain, Notification } from "electron";
import { join } from "path";
import { loadSettings } from "./settings";
import { shouldNotify } from "./notify-rules";
import type { DesktopNotification } from "./preload";

let mainWindow: BrowserWindow | null = null;

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

void app.whenReady().then(createWindow);

// macOS keeps apps running with no windows; clicking the dock icon reopens one.
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
