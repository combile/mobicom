# 데스크톱 앱 1단계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 랩 서버의 Mobi:ON을 Electron으로 감싸, 채팅을 보고 있지 않아도 새 메시지·멘션이 OS 알림으로 오게 한다.

**Architecture:** Electron 셸이 랩 서버(`http://203.230.103.35:3300`)를 `BrowserWindow`로 로드한다. 웹앱은 이미 `/api/mobion/chat/stream`을 SSE로 듣고 있으므로, 그 델타 핸들러에서 preload가 노출한 `window.mobion` 브릿지를 호출해 알림을 요청한다. Electron 코드는 창 수명·트레이·알림·배지만 담당하고, 브라우저에서는 브릿지가 없어 아무 일도 일어나지 않는다.

**Tech Stack:** Electron 33, electron-builder, TypeScript, Node 20+ (랩 서버 v20.20.2, 개발 머신 v22.17.1)

**Spec:** `docs/superpowers/specs/2026-09-09-desktop-app-design.md`

## Global Constraints

- 웹앱(`src/**`)의 기존 동작은 브라우저에서 그대로여야 한다. 브릿지가 없을 때 새 코드는 전부 no-op이다.
- `contextIsolation: true`, `nodeIntegration: false`를 유지한다. 원격 페이지를 로드하므로 이것을 끄면 그 페이지 스크립트가 Node에 닿는다.
- 창 닫기는 종료가 아니라 숨기기다. 렌더러가 죽으면 SSE가 끊기고 알림도 멈춘다.
- 서버 기본 주소: `http://203.230.103.35:3300`
- 설정 파일 경로: `app.getPath("userData")/settings.json`
- `desktop/`은 웹앱 빌드에 포함되지 않는다.
- 커밋 본문은 한국어로 쓰고 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`로 끝낸다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `desktop/package.json` | Electron 의존성과 빌드 설정 |
| `desktop/tsconfig.json` | 메인·프리로드 전용 TS 설정 |
| `desktop/src/notify-rules.ts` | 알림 여부 판정 순수 함수 + 자체 점검 |
| `desktop/src/settings.ts` | 설정 파일 읽기·쓰기 |
| `desktop/src/preload.ts` | `window.mobion` 브릿지 |
| `desktop/src/main.ts` | 창·트레이·알림·배지·IPC |
| `desktop/src/offline.html` | 서버 연결 실패 안내 |
| `src/lib/mobion-desktop.ts` | 웹앱이 쓰는 브릿지 래퍼 (브라우저에서 no-op) |
| `src/components/MobiOnContent.tsx` | delta 핸들러에서 알림 요청, 배지 갱신 |

---

### Task 1: Electron 프로젝트 뼈대와 빈 창

창 하나만 있는 최소 상태. 여기까지만 되어도 "앱으로 뜬다"가 확인된다.

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/tsconfig.json`
- Create: `desktop/.gitignore`
- Create: `desktop/src/main.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `npm --prefix desktop start`로 실행되는 Electron 앱

- [ ] **Step 1: `desktop/package.json` 작성**

```json
{
  "name": "mobion-desktop",
  "version": "0.1.0",
  "private": true,
  "description": "Mobi:ON 데스크톱",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "npm run build && electron .",
    "dist:mac": "npm run build && electron-builder --mac",
    "dist:win": "npm run build && electron-builder --win"
  },
  "devDependencies": {
    "electron": "^33.2.0",
    "electron-builder": "^25.1.8",
    "typescript": "^5.6.3",
    "@types/node": "^20.17.6"
  }
}
```

- [ ] **Step 2: `desktop/tsconfig.json` 작성**

메인 프로세스는 CommonJS다. Electron이 `main`으로 지정된 파일을 `require`로 읽는다.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: `desktop/.gitignore` 작성**

```
node_modules/
dist/
release/
```

- [ ] **Step 4: 최소 `desktop/src/main.ts` 작성**

```typescript
import { app, BrowserWindow } from "electron";

const SERVER_URL = "http://203.230.103.35:3300";

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
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void mainWindow.loadURL(SERVER_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

void app.whenReady().then(createWindow);

// macOS keeps apps running with no windows; clicking the dock icon reopens one.
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 5: 의존성 설치**

Run: `npm --prefix desktop install`
Expected: `desktop/node_modules` 생성, 에러 없음

- [ ] **Step 6: 실행해서 랩 서버 화면이 뜨는지 확인**

Run: `npm --prefix desktop start`
Expected: 창이 열리고 Mobi:ON 로그인 또는 채팅 화면이 보인다.

랩 서버가 꺼져 있으면 흰 화면이 뜬다. Task 6에서 안내 화면을 붙인다.

- [ ] **Step 7: 웹앱 빌드가 영향받지 않는지 확인**

Run: `npx tsc --noEmit && npm run build`
Expected: 통과. 실패하면 루트 `tsconfig.json`의 `exclude`에 `"desktop"`을 추가한다.

- [ ] **Step 8: 커밋**

```bash
git add desktop/
git commit -F - <<'MSG'
feat: Electron 셸로 랩 서버를 띄우는 창

창 하나만 있는 최소 상태다. contextIsolation과 nodeIntegration은 기본값을
그대로 둔다 — 원격 페이지를 로드하는 앱에서 이걸 끄면 그 페이지의 스크립트가
Node에 닿는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: 알림 여부 판정 (순수 함수 + 자체 점검)

조건이 넷 겹치는 자리다. 틀렸을 때가 대칭이 아니다 — 너무 엄격하면 들었어야
할 것을 놓치고, 너무 느슨하면 앱이 음소거 대상이 된다. UI보다 먼저,
독립적으로 검증한다.

**Files:**
- Create: `desktop/src/notify-rules.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type NotifySettings = { enabled: boolean; otherMessages: boolean; taskAssigned: boolean }`
  - `type NotifyInput = { kind: "message" | "mention" | "task"; authorId: string | null; channelId: string | null; mySocialId: string | null; activeChannelId: string | null; windowFocused: boolean; settings: NotifySettings }`
  - `function shouldNotify(input: NotifyInput): boolean`

- [ ] **Step 1: 실패하는 자체 점검을 먼저 작성**

`desktop/src/notify-rules.ts`에 아래를 넣는다. `shouldNotify`가 아직 없으므로 실행하면 실패한다.

```typescript
// Runnable self-check (no test framework in this repo — the web app's
// mobion-mentions.ts uses the same pattern). Run with:
//   npx --yes tsx desktop/src/notify-rules.ts
if (require.main === module) {
  const assert = require("node:assert") as typeof import("node:assert");

  const on: NotifySettings = { enabled: true, otherMessages: true, taskAssigned: true };
  const base: NotifyInput = {
    kind: "message",
    authorId: "someone-else",
    channelId: "c1",
    mySocialId: "me",
    activeChannelId: "c2",
    windowFocused: false,
    settings: on,
  };

  // the ordinary case: someone else posted in a channel I am not looking at
  assert.strictEqual(shouldNotify(base), true);

  // my own message comes back down the stream it was sent on
  assert.strictEqual(shouldNotify({ ...base, authorId: "me" }), false);

  // the channel I am reading, with the window in front of me
  assert.strictEqual(
    shouldNotify({ ...base, activeChannelId: "c1", windowFocused: true }),
    false,
  );
  // same channel, but the window is behind something else — not reading it
  assert.strictEqual(
    shouldNotify({ ...base, activeChannelId: "c1", windowFocused: false }),
    true,
  );

  // "other messages" off silences ordinary posts
  assert.strictEqual(
    shouldNotify({ ...base, settings: { ...on, otherMessages: false } }),
    false,
  );
  // ...but never a mention
  assert.strictEqual(
    shouldNotify({ ...base, kind: "mention", settings: { ...on, otherMessages: false } }),
    true,
  );
  // a mention in the channel already being read is still redundant
  assert.strictEqual(
    shouldNotify({ ...base, kind: "mention", activeChannelId: "c1", windowFocused: true }),
    false,
  );

  // the tray master switch beats everything, mentions included
  assert.strictEqual(
    shouldNotify({ ...base, kind: "mention", settings: { ...on, enabled: false } }),
    false,
  );

  // a task has no channel; null === null must not count as "already reading"
  assert.strictEqual(
    shouldNotify({ ...base, kind: "task", channelId: null, activeChannelId: null }),
    true,
  );
  assert.strictEqual(
    shouldNotify({
      ...base,
      kind: "task",
      channelId: null,
      activeChannelId: null,
      settings: { ...on, taskAssigned: false },
    }),
    false,
  );

  console.log("notify-rules self-check passed");
}
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `npx --yes tsx desktop/src/notify-rules.ts`
Expected: FAIL — `shouldNotify is not defined`

- [ ] **Step 3: 최소 구현 작성**

위 자체 점검 블록 **앞에** 넣는다.

```typescript
export type NotifySettings = {
  /** The tray switch. Off silences everything, mentions included. */
  enabled: boolean;
  otherMessages: boolean;
  taskAssigned: boolean;
};

export type NotifyInput = {
  kind: "message" | "mention" | "task";
  /** Huly PersonId of the author, or null for events with no author. */
  authorId: string | null;
  channelId: string | null;
  mySocialId: string | null;
  activeChannelId: string | null;
  windowFocused: boolean;
  settings: NotifySettings;
};

/**
 * Whether this event is worth interrupting someone for.
 *
 * Four conditions overlap here, and getting it wrong is not symmetric: too
 * strict and people miss what they were told, too loose and the app becomes
 * the thing they mute. Pure, so it can be checked without an Electron window.
 */
export function shouldNotify(input: NotifyInput): boolean {
  if (!input.settings.enabled) return false;

  // Own messages come back down the same stream they were sent on.
  if (input.authorId !== null && input.authorId === input.mySocialId) return false;

  // Already reading it. Both halves matter: an open channel is not enough if
  // the window is behind something else.
  const readingThisChannel =
    input.channelId !== null &&
    input.channelId === input.activeChannelId &&
    input.windowFocused;
  if (readingThisChannel) return false;

  if (input.kind === "task") return input.settings.taskAssigned;
  // A mention is never silenced by the ordinary-message setting — being named
  // is the case that setting exists to let through.
  if (input.kind === "mention") return true;
  return input.settings.otherMessages;
}
```

- [ ] **Step 4: 실행해서 통과 확인**

Run: `npx --yes tsx desktop/src/notify-rules.ts`
Expected: `notify-rules self-check passed`

- [ ] **Step 5: 커밋**

```bash
git add desktop/src/notify-rules.ts
git commit -F - <<'MSG'
feat: 알림 여부 판정과 자체 점검

조건이 넷 겹치는 자리라 창 없이 검증할 수 있게 순수 함수로 뺐다. 틀렸을 때가
대칭이 아니다 — 너무 엄격하면 들었어야 할 것을 놓치고, 너무 느슨하면 앱이
음소거 대상이 된다.

멘션은 "그 외 메시지" 설정으로 막히지 않는다. 이름이 불린 경우야말로 그
설정이 통과시키려고 있는 자리다. 트레이 스위치는 멘션까지 덮는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: 설정 파일 읽기·쓰기

**Files:**
- Create: `desktop/src/settings.ts`

**Interfaces:**
- Consumes: `NotifySettings` (Task 2)
- Produces:
  - `const DEFAULT_SERVER_URL = "http://203.230.103.35:3300"`
  - `type Settings = { serverUrl: string; notify: NotifySettings }`
  - `function loadSettings(): Settings`
  - `function saveSettings(next: Settings): void`

- [ ] **Step 1: 구현 작성**

```typescript
import { app } from "electron";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { NotifySettings } from "./notify-rules";

export const DEFAULT_SERVER_URL = "http://203.230.103.35:3300";

export type Settings = {
  serverUrl: string;
  notify: NotifySettings;
};

const DEFAULTS: Settings = {
  serverUrl: DEFAULT_SERVER_URL,
  notify: { enabled: true, otherMessages: true, taskAssigned: true },
};

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

/**
 * Reads the settings file, filling in anything missing from defaults.
 *
 * Merged field by field rather than all-or-nothing: a file written by an older
 * version lacks whatever was added since, and losing every setting because one
 * key is absent would be worse than the file not existing at all.
 */
export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<Settings>;
    return {
      serverUrl:
        typeof raw.serverUrl === "string" && raw.serverUrl ? raw.serverUrl : DEFAULTS.serverUrl,
      notify: { ...DEFAULTS.notify, ...(raw.notify ?? {}) },
    };
  } catch {
    // No file yet, or unreadable. Defaults are a working configuration.
    return DEFAULTS;
  }
}

export function saveSettings(next: Settings): void {
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2), "utf8");
}
```

- [ ] **Step 2: `main.ts`가 설정의 주소를 쓰도록 수정**

`const SERVER_URL = "..."` 줄을 지우고, `createWindow` 안의 `loadURL`을 바꾼다.

```typescript
import { loadSettings } from "./settings";
```

```typescript
  void mainWindow.loadURL(loadSettings().serverUrl);
```

- [ ] **Step 3: 컴파일 확인**

Run: `npm --prefix desktop run build`
Expected: 에러 없이 `desktop/dist/settings.js` 생성

- [ ] **Step 4: 커밋**

```bash
git add desktop/src/settings.ts desktop/src/main.ts
git commit -F - <<'MSG'
feat: 설정 파일

서버가 아니라 기기에 둔다. "이 컴퓨터에서 알림을 받을지"에 대한 답이라, 같은
사람이 랩 PC에서는 받고 집에서는 안 받고 싶을 수 있다.

없는 키는 항목별로 기본값을 채운다. 옛 버전이 쓴 파일에는 그 뒤에 늘어난
설정이 없는데, 키 하나가 빠졌다고 전부 날리는 것이 파일이 없는 것보다 나쁘다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 4: preload 브릿지와 웹앱 래퍼

웹앱이 부를 창구를 만든다. 아직 알림은 뜨지 않는다.

**Files:**
- Create: `desktop/src/preload.ts`
- Create: `src/lib/mobion-desktop.ts`
- Modify: `desktop/src/main.ts` (preload 연결)

**Interfaces:**
- Consumes: 없음
- Produces:
  - 렌더러 전역 `window.mobion`
  - `type DesktopNotification = { kind: "message" | "mention" | "task"; title: string; body: string; channelId: string | null; authorId: string | null; activeChannelId: string | null; mySocialId: string | null }`
  - `function isDesktop(): boolean`
  - `function notifyDesktop(payload: DesktopNotification): void`
  - `function setDesktopBadge(count: number): void`
  - `function onDesktopChannelOpen(handler: (channelId: string) => void): () => void`

- [ ] **Step 1: `desktop/src/preload.ts` 작성**

```typescript
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
```

- [ ] **Step 2: `main.ts`에서 preload 연결**

파일 상단에 `import { join } from "path";`를 추가하고, `webPreferences`를 바꾼다.

```typescript
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
```

- [ ] **Step 3: `src/lib/mobion-desktop.ts` 작성**

```typescript
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

type MobionBridge = {
  notify: (payload: DesktopNotification) => void;
  setBadge: (count: number) => void;
  onOpenChannel: (handler: (channelId: string) => void) => () => void;
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
```

- [ ] **Step 4: 브릿지가 실제로 노출되는지 확인**

Run: `npm --prefix desktop start`

앱이 뜨면 `Cmd+Opt+I`로 개발자 도구를 열고 콘솔에 입력:

```javascript
typeof window.mobion.notify
```

Expected: `"function"`

- [ ] **Step 5: 웹앱 타입체크**

Run: `npx tsc --noEmit`
Expected: 통과

- [ ] **Step 6: 커밋**

```bash
git add desktop/src/preload.ts desktop/src/main.ts src/lib/mobion-desktop.ts
git commit -F - <<'MSG'
feat: 데스크톱 브릿지

contextBridge로 세 가지만 건넨다. 로드되는 페이지가 원격이라 이 브릿지가 그
페이지가 닿을 수 있는 전부다 — 여기 뭘 더하면 그 페이지가 할 수 있는 일이
늘어난다.

웹앱 쪽 래퍼는 브라우저에서 전부 no-op이다. 같은 앱을 둘 다에 내보내는데,
호출하는 자리마다 브릿지 존재 검사를 두는 대신 한 곳에 모았다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: 알림 띄우기

여기서 처음으로 알림이 실제로 뜬다.

**Files:**
- Modify: `desktop/src/main.ts`
- Modify: `src/components/MobiOnContent.tsx` (delta 핸들러, 291~294행 부근)

**Interfaces:**
- Consumes: `shouldNotify` (Task 2), `loadSettings` (Task 3), `notifyDesktop`·`onDesktopChannelOpen` (Task 4)
- Produces: IPC 채널 `mobion:notify`(렌더러→메인), `mobion:open-channel`(메인→렌더러)

- [ ] **Step 1: `main.ts`에 IPC 알림 핸들러 추가**

import를 `import { app, BrowserWindow, ipcMain, Notification } from "electron";`으로 바꾸고, 아래를 `createWindow` 정의 뒤·`app.whenReady()` 앞에 넣는다.

```typescript
import { shouldNotify } from "./notify-rules";
import type { DesktopNotification } from "./preload";

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
```

- [ ] **Step 2: `MobiOnContent.tsx`에 ref 추가**

SSE 핸들러는 `useEffect`가 등록할 때의 값을 붙든 채 남는다. 상태를 직접 읽으면 채널을 바꿔도 등록 시점의 채널로 판단한다.

`mySocialId` 정의(`activeMessages` 아래) **뒤에** 넣는다.

```typescript
  // The SSE handlers are registered once and outlive every state change, so
  // they read through refs rather than closing over values that will be stale
  // by the time a message arrives.
  const activeChannelIdRef = useRef<string | null>(null);
  const mySocialIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const channelsRef = useRef<Channel[]>([]);

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
    mySocialIdRef.current = mySocialId;
    currentUserIdRef.current = currentUserId;
    channelsRef.current = channels;
  }, [activeChannelId, mySocialId, currentUserId, channels]);
```

- [ ] **Step 3: delta 핸들러에서 알림 요청**

291~294행의 핸들러를 아래로 바꾼다.

```typescript
      es.addEventListener("delta", (e) => {
        const msg = JSON.parse((e as MessageEvent).data) as Message;
        setMessages((prev) => [...prev, msg]);

        // No-op in a browser. Whether it actually interrupts anyone is decided
        // in the desktop shell, which is the side that knows if its window is
        // in front.
        const channel = channelsRef.current.find((c) => c.id === msg.channelId);
        const me = currentUserIdRef.current;
        notifyDesktop({
          kind: me && messageContainsMentionOf(msg.text, me) ? "mention" : "message",
          title: channel ? `#${channel.name}` : "새 메시지",
          body: `${msg.authorName ?? "알 수 없음"}: ${mentionPlainText(msg.text).slice(0, 120)}`,
          channelId: msg.channelId,
          authorId: msg.authorId,
          activeChannelId: activeChannelIdRef.current,
          mySocialId: mySocialIdRef.current,
        });
      });
```

- [ ] **Step 4: 알림 클릭 시 채널 이동 연결**

`MobiOnContent` 안에 추가한다.

```typescript
  // Clicking a notification should land on the conversation it came from.
  useEffect(
    () =>
      onDesktopChannelOpen((channelId) => {
        setMode("chat");
        setActiveChannelId(channelId);
      }),
    [],
  );
```

- [ ] **Step 5: import 추가**

`MobiOnContent.tsx` 상단에 넣는다. `mentionPlainText`와 `messageContainsMentionOf`는 이미 import되어 있다.

```typescript
import { notifyDesktop, onDesktopChannelOpen } from "@/lib/mobion-desktop";
```

- [ ] **Step 6: 타입체크와 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 통과

- [ ] **Step 7: 랩 서버에 배포**

알림을 확인하려면 서버가 이 코드를 돌고 있어야 한다.

```bash
git push origin feat/desktop-app
ssh mobicom@203.230.103.35 'export PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH; cd ~/mobicom-app && git fetch origin && git checkout feat/desktop-app && git pull --ff-only origin feat/desktop-app && npm run build'
ssh mobicom@203.230.103.35 'export PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH; pm2 restart mobicom-app --update-env'
```

PATH를 빼면 낡은 Node가 잡혀 `??=`에서 죽는다(`DEPLOY.md` 5·7번).

- [ ] **Step 8: 알림 동작 확인**

Run: `npm --prefix desktop start`

다른 계정(또는 브라우저)에서 메시지를 보낸다.

Expected:
- 다른 채널에 온 메시지 → OS 알림이 뜬다
- 보고 있는 채널 + 창이 앞에 있음 → 알림 없음
- 내가 보낸 메시지 → 알림 없음
- 알림 클릭 → 창이 앞으로 오고 그 채널이 열린다

- [ ] **Step 9: 커밋**

```bash
git add desktop/src/main.ts src/components/MobiOnContent.tsx
git commit -F - <<'MSG'
feat: 새 메시지와 멘션을 OS 알림으로

판정은 메인 프로세스에서 한다. 렌더러는 어떤 채널이 열려 있고 그 메시지가
자기 것인지 알고, 메인은 창이 앞에 있는지와 설정을 안다. 둘 다 있어야 결정할
수 있어서 렌더러 쪽 절반을 실어 보낸다.

SSE 핸들러는 한 번 등록되고 이후 모든 상태 변화보다 오래 산다. 상태를 직접
읽으면 등록 시점의 채널로 판단하므로 ref를 통해 읽는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 6: 트레이, 닫기=숨기기, 연결 실패 화면

앱을 닫아도 알림이 계속 오게 만드는 부분. 여기까지가 "쓸 수 있는 앱"이다.

**Files:**
- Create: `desktop/build/tray.png` (16×16 PNG)
- Create: `desktop/src/offline.html`
- Modify: `desktop/src/main.ts`

**Interfaces:**
- Consumes: `loadSettings`·`saveSettings` (Task 3)
- Produces: 트레이 아이콘, `isQuitting` 플래그

- [ ] **Step 1: 트레이 아이콘 준비**

`desktop/build/tray.png`에 16×16 PNG를 둔다. macOS 메뉴바는 템플릿 이미지를 쓰므로 검정 실루엣 + 투명 배경으로 만든다. 없으면 임시로 아무 PNG나 두고 나중에 교체한다.

- [ ] **Step 2: `desktop/src/offline.html` 작성**

```html
<!doctype html>
<meta charset="utf-8" />
<title>연결할 수 없음</title>
<style>
  body {
    margin: 0; height: 100vh; display: grid; place-items: center;
    font-family: system-ui, -apple-system, sans-serif;
    background: #fafafa; color: #1f2328;
  }
  .box { text-align: center; max-width: 340px; }
  h1 { font-size: 17px; margin: 0 0 8px; }
  p { font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 18px; }
  button {
    padding: 9px 18px; border: none; border-radius: 8px;
    background: #3b82f6; color: #fff; font-weight: 600; cursor: pointer;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1c1c1e; color: #f2f2f7; }
    p { color: #9aa0a6; }
  }
</style>
<div class="box">
  <h1>랩 서버에 연결할 수 없습니다</h1>
  <p>서버가 꺼져 있거나 랩 네트워크 밖일 수 있습니다.</p>
  <button onclick="location.reload()">다시 시도</button>
</div>
```

- [ ] **Step 3: `main.ts`에 트레이 추가**

import를 `import { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } from "electron";`으로 바꾸고, `saveSettings`도 import한다.

```typescript
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
```

- [ ] **Step 4: 창 닫기를 숨기기로 바꾸기**

`createWindow` 안, `loadURL` 뒤에 추가한다.

```typescript
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
```

- [ ] **Step 5: 앱 수명 이벤트 수정**

```typescript
void app.whenReady().then(() => {
  createWindow();
  createTray();
});

// Every platform keeps running: a closed window is how this app sits in the
// background, not a signal to exit.
app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  isQuitting = true;
});
```

기존 `app.on("window-all-closed", ...)`와 `app.on("activate", ...)`의 중복을 정리한다. `activate`는 `showWindow`를 부르게 남긴다.

- [ ] **Step 6: 동작 확인**

Run: `npm --prefix desktop start`

Expected:
- 창을 닫아도 앱이 살아 있고 트레이에 아이콘이 있다
- 트레이 아이콘 클릭 → 창 복귀
- 창이 닫힌 상태에서 다른 계정이 메시지를 보내면 알림이 온다
- 트레이 메뉴 "알림 받기"를 끄면 알림이 멈춘다
- 트레이 메뉴 "종료" → 앱이 실제로 종료된다

연결 실패 화면 확인:

```bash
ssh mobicom@203.230.103.35 'export PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH; pm2 stop mobicom-app'
# 앱을 재시작해 안내 화면 확인 후
ssh mobicom@203.230.103.35 'export PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH; pm2 start mobicom-app'
```

- [ ] **Step 7: 커밋**

```bash
git add desktop/
git commit -F - <<'MSG'
feat: 트레이와 백그라운드 상주, 연결 실패 화면

닫기를 종료가 아니라 숨기기로 둔다. 렌더러가 SSE 연결을 들고 있어서 창을
없애면 알림이 멈추는데, 그건 이 앱이 존재하는 이유가 사라지는 것이다.
isQuitting 플래그로 "사용자가 창을 닫았다"와 "정말 종료한다"를 가른다 —
없으면 트레이에서 종료해도 창만 숨고 앱이 끝나지 않는다.

서버에 못 붙으면 흰 화면 대신 안내를 띄운다. 랩 서버는 재부팅으로 꺼져 있는
일이 실제로 있으므로 예외가 아니라 정상 경로다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 7: 안 읽음 배지

**Files:**
- Modify: `desktop/src/main.ts`
- Modify: `src/components/MobiOnContent.tsx`

**Interfaces:**
- Consumes: `setDesktopBadge` (Task 4), `unreadCount`(`MobiOnContent.tsx:749` 부근)
- Produces: IPC 채널 `mobion:badge`

- [ ] **Step 1: `main.ts`에 배지 핸들러 추가**

```typescript
ipcMain.on("mobion:badge", (_event, count: number) => {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  // macOS has a dock badge. Windows has a taskbar overlay and wants an image,
  // so the count is drawn as text.
  if (process.platform === "darwin") {
    app.setBadgeCount(n);
    return;
  }
  if (!mainWindow) return;
  if (n === 0) {
    mainWindow.setOverlayIcon(null, "");
    return;
  }
  const label = n > 99 ? "99+" : String(n);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <circle cx="16" cy="16" r="16" fill="#dc2626"/>
    <text x="16" y="22" font-size="${label.length > 2 ? 13 : 17}" font-family="sans-serif"
      fill="white" text-anchor="middle">${label}</text>
  </svg>`;
  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
  mainWindow.setOverlayIcon(image, `읽지 않은 메시지 ${label}개`);
});
```

- [ ] **Step 2: 웹앱에서 총 안 읽음을 보내기**

`unreadCount` 정의보다 **뒤에** 넣는다.

```typescript
  // The badge mirrors what the channel list already shows, summed. Sent on
  // change rather than polled — these numbers recompute here anyway.
  const totalUnread = channels.reduce((sum, c) => sum + unreadCount(c.id), 0);
  useEffect(() => {
    setDesktopBadge(totalUnread);
  }, [totalUnread]);
```

- [ ] **Step 3: import 수정**

```typescript
import { notifyDesktop, onDesktopChannelOpen, setDesktopBadge } from "@/lib/mobion-desktop";
```

- [ ] **Step 4: 타입체크와 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 통과

- [ ] **Step 5: 동작 확인**

Run: `npm --prefix desktop start`
Expected: 다른 계정에서 메시지를 보내면 독(macOS)에 숫자가 뜨고, 그 채널을 읽으면 사라진다.

- [ ] **Step 6: 커밋**

```bash
git add desktop/src/main.ts src/components/MobiOnContent.tsx
git commit -F - <<'MSG'
feat: 안 읽음 배지

macOS는 독 배지를 그대로 쓰고, Windows는 오버레이가 이미지를 요구해 숫자를
SVG로 그려 넣는다. 채널 목록이 이미 세고 있는 값을 합쳐 보내므로 따로 폴링하지
않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 8: 배포 산출물

**Files:**
- Modify: `desktop/package.json`
- Create: `desktop/build/icon.icns`, `desktop/build/icon.ico`
- Create: `desktop/README.md`

**Interfaces:**
- Consumes: Task 1~7
- Produces: `desktop/release/` 아래 `.dmg`와 `.exe`

- [ ] **Step 1: 앱 아이콘 준비**

```bash
mkdir -p /tmp/icon.iconset
sips -z 512 512 <원본>.png --out /tmp/icon.iconset/icon_512x512.png
sips -z 256 256 <원본>.png --out /tmp/icon.iconset/icon_256x256.png
sips -z 128 128 <원본>.png --out /tmp/icon.iconset/icon_128x128.png
iconutil -c icns /tmp/icon.iconset -o desktop/build/icon.icns
```

`.ico`는 `npx --yes png-to-ico <원본>.png > desktop/build/icon.ico`로 만든다. 없으면 electron-builder가 기본 Electron 아이콘을 쓴다.

- [ ] **Step 2: `desktop/package.json`에 build 설정 추가**

`scripts` 뒤에 넣는다. `productName`에 콜론을 쓰지 않는다 — 파일 이름에 들어가는데 Windows가 허용하지 않는다.

```json
  "build": {
    "appId": "kr.ac.hanbat.mobicom.mobion",
    "productName": "Mobi-ON",
    "directories": { "output": "release", "buildResources": "build" },
    "files": ["dist/**/*", "src/offline.html", "build/tray.png"],
    "mac": {
      "target": ["dmg"],
      "category": "public.app-category.productivity",
      "icon": "build/icon.icns"
    },
    "win": { "target": ["nsis"], "icon": "build/icon.ico" },
    "nsis": { "oneClick": false, "allowToChangeInstallationDirectory": true }
  }
```

- [ ] **Step 3: macOS 산출물 빌드**

Run: `npm --prefix desktop run dist:mac`
Expected: `desktop/release/Mobi-ON-0.1.0-arm64.dmg` 생성

- [ ] **Step 4: 설치해서 실행 확인**

`.dmg`를 열어 응용 프로그램으로 옮기고 실행한다.

Expected: 서명이 없어 "확인되지 않은 개발자" 경고가 뜬다. **우클릭 → 열기**로 실행된다. 실행 후 알림·트레이·배지가 개발 모드와 같아야 한다.

- [ ] **Step 5: Windows 산출물 빌드**

Run: `npm --prefix desktop run dist:win`
Expected: `desktop/release/Mobi-ON Setup 0.1.0.exe` 생성

Mac에서 크로스 빌드가 되지만 **실제 동작 확인은 Windows PC에서 해야 한다.** 작업표시줄 오버레이 배지는 Windows에서만 확인 가능하다.

- [ ] **Step 6: `desktop/README.md` 작성**

````markdown
# Mobi:ON 데스크톱

랩 서버의 Mobi:ON을 감싼 Electron 앱. 채팅을 보고 있지 않아도 새 메시지와
멘션이 OS 알림으로 온다.

## 개발

```bash
npm --prefix desktop install
npm --prefix desktop start
```

## 배포본 만들기

```bash
npm --prefix desktop run dist:mac   # release/*.dmg
npm --prefix desktop run dist:win   # release/*.exe
```

코드 서명을 하지 않으므로 첫 실행 때 경고가 뜬다.

- macOS: 우클릭 → 열기
- Windows: "추가 정보" → "실행"

## 설정

- macOS: `~/Library/Application Support/Mobi-ON/settings.json`
- Windows: `%APPDATA%\Mobi-ON\settings.json`

```json
{
  "serverUrl": "http://203.230.103.35:3300",
  "notify": { "enabled": true, "otherMessages": true, "taskAssigned": true }
}
```

서버 주소가 바뀌면 이 파일만 고치면 된다. 다시 빌드할 필요는 없다.

## 손으로 확인할 것

- 창을 닫아도 트레이에 남고 알림이 계속 오는가
- 보고 있는 채널의 메시지는 알리지 않는가
- 내가 보낸 메시지는 알리지 않는가
- 멘션 알림은 "그 외 메시지"를 꺼도 오는가
- 알림을 클릭하면 그 채널이 열리는가
- 앱을 껐다 켜도 로그인이 유지되는가
- 서버가 꺼져 있을 때 안내 화면이 뜨는가
- 배지 숫자가 안 읽음과 맞는가
````

- [ ] **Step 7: 커밋**

```bash
git add desktop/
git commit -F - <<'MSG'
feat: macOS·Windows 배포본 빌드 설정

코드 서명은 하지 않는다. 유료 인증서가 필요하고, 랩 안에서 나눠 쓰는 데는 첫
실행 경고를 우회하는 것으로 충분하다. 자동 업데이트도 서명이 전제라 함께
미룬다 — 새 버전은 파일로 전달한다.

productName에 콜론을 쓰지 않았다. 파일 이름에 들어가는데 Windows가 허용하지
않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## 완료 조건

`desktop/README.md`의 확인 목록 8개가 모두 통과하고, macOS와 Windows에서 각각
설치본이 실행된다.

## 이 계획 밖

- **오프라인 읽기(2단계)** — 로컬 캐시와 동기화. 별도 설계가 필요하다.
- **태스크 배정 알림** — `shouldNotify`는 `kind: "task"`를 이미 처리하지만, 배정은 SSE가 아니라 `/api/mobion/notifications` 폴링으로 오므로 그쪽을 잇는 작업이 따로 필요하다.
- **코드 서명과 자동 업데이트** — 인증서를 구하면.
