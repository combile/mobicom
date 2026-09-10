"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import MentionInput from "./MentionInput";
import ChatMessageRow, { type Reaction, type Attachment } from "./ChatMessageRow";
import ConfirmDialog from "./ConfirmDialog";
import ChatTaskModal from "./ChatTaskModal";
import ProjectSidebarList from "./ProjectSidebarList";
import ProjectDetailView from "./ProjectDetailView";
import {
  parseMentionSegments,
  messageContainsMentionOf,
  encodeMentions,
  mentionPlainText,
} from "@/lib/mobion-mentions";
import { useTasksData } from "@/lib/use-tasks-data";
import { useScheduleData } from "@/lib/use-schedule-data";
import ScheduleView from "./ScheduleView";
import { useContestsData } from "@/lib/use-contests-data";
import { useOverviewData } from "@/lib/use-overview-data";
import { useHomeData } from "@/lib/use-home-data";
import HomeView from "./HomeView";
import InboxView from "./InboxView";
import NotificationTray from "./NotificationTray";
import { useInboxData } from "@/lib/use-inbox-data";
import ContestsView from "./ContestsView";
import OverviewView from "./OverviewView";
import LabView from "./LabView";
import { useLabData } from "@/lib/use-lab-data";
import CommandPalette, { type SearchResult } from "./CommandPalette";
import { useCloseOnEscape, useModalEnterAnimation } from "@/lib/use-modal-enter-animation";
import { ModalOverlay, ModalCard, ModalTitle, Field, ModalActions } from "./modal-styles";
import { notifyDesktop, onDesktopChannelOpen, setDesktopBadge } from "@/lib/mobion-desktop";

type Channel = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  kind: "channel" | "dm";
  online?: boolean;
};
type Message = {
  id: string;
  channelId: string;
  text: string;
  authorId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  createdOn: number;
};

function formatTime(ms: number) {
  return new Date(ms).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AVATAR_COLORS = ["var(--accent)", "var(--warn)", "var(--milestone)", "var(--ok)", "var(--danger)", "var(--warn)"];

function avatarColor(authorId: string) {
  let hash = 0;
  for (let i = 0; i < authorId.length; i++) hash = (hash * 31 + authorId.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Whether two messages would show the same clock reading.
 *
 * The header carries one time for the whole group, so a group may only hold
 * messages that share it. Without this, a run started at 10:01 swallowed a
 * 10:04 message under a header saying 10:01 — the reader had to hover to find
 * out when anything actually arrived.
 */
function sameMinute(a: number, b: number) {
  return Math.floor(a / 60000) === Math.floor(b / 60000);
}

type MessageGroup = {
  authorId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  messages: Message[];
};

function renderMessageText(
  text: string,
  knownUserIds: Set<string>,
  onMentionClick?: (userId: string, name: string) => void,
) {
  return parseMentionSegments(text).map((seg, i) => {
    if (seg.type === "text") return <span key={i}>{seg.content}</span>;
    // A name that matches nobody stays plain text — it is not a link to
    // anywhere, and styling it as one would promise a profile that cannot open.
    if (!knownUserIds.has(seg.userId)) return <span key={i}>@{seg.name}</span>;
    if (!onMentionClick) return <Mention key={i}>@{seg.name}</Mention>;
    return (
      <Mention
        key={i}
        role="button"
        tabIndex={0}
        data-clickable
        onClick={() => onMentionClick(seg.userId, seg.name)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onMentionClick(seg.userId, seg.name);
          }
        }}
      >
        @{seg.name}
      </Mention>
    );
  });
}

function groupMessages(list: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const m of list) {
    const last = groups[groups.length - 1];
    const lastMessage = last?.messages[last.messages.length - 1];
    if (
      last &&
      last.authorId === m.authorId &&
      lastMessage &&
      m.createdOn - lastMessage.createdOn < GROUP_WINDOW_MS &&
      // the group's header shows one time; it has to be true of every message
      // under it
      sameMinute(m.createdOn, last.messages[0].createdOn)
    ) {
      last.messages.push(m);
    } else {
      groups.push({
        authorId: m.authorId,
        authorName: m.authorName,
        authorAvatarUrl: m.authorAvatarUrl,
        messages: [m],
      });
    }
  }
  return groups;
}

type WorkspaceMode =
  | "home"
  | "inbox"
  | "chat"
  | "projects"
  | "schedule"
  | "contests"
  | "overview"
  | "lab";

export default function MobiOnContent() {
  const [mode, setMode] = useState<WorkspaceMode>("home");
  // 알림함은 모드가 아니라 열림/닫힘이다 — 열려도 보던 화면은 그대로다.
  const [trayOpen, setTrayOpen] = useState(false);
  // declared here rather than with the other chat state because useTasksData
  // needs it, and a const cannot be read before its declaration
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [role, setRole] = useState<"member" | "lead" | "professor">("member");
  const [paletteOpen, setPaletteOpen] = useState(false);
  // the two roles answerable for the lab as a whole
  const canOversee = role === "lead" || role === "professor";
  const tasksData = useTasksData(mode === "projects", currentUserId);
  const scheduleData = useScheduleData(mode === "schedule");
  const contestsData = useContestsData(mode === "contests");
  const overviewData = useOverviewData(mode === "overview");
  const labData = useLabData(mode === "lab");
  const homeData = useHomeData(mode === "home");
  const inboxData = useInboxData(mode === "inbox");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  // Which conversations have been read back to their first message, so the
  // "older" control disappears instead of fetching an empty page forever.
  const [exhausted, setExhausted] = useState<Record<string, boolean>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  // channelId -> createdOn of the newest message this person has seen there
  const [reads, setReads] = useState<Record<string, number>>({});
  // how many messages per conversation the snapshot carried, so a count that
  // hits the cap can say "50+" instead of claiming to be exact
  const [perSpaceLimit, setPerSpaceLimit] = useState(0);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  // messageId -> its reactions / attachments / the message it answers. Kept as
  // three maps beside `messages` rather than merged into each Message: the SSE
  // snapshot owns that array and replaces it wholesale on every reconnect,
  // which would throw away anything merged in.
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [replyOf, setReplyOf] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  // channelId -> everyone else's read position, for the "N명 읽음" line
  const [othersReads, setOthersReads] = useState<
    Record<string, { userId: string; name: string; lastReadOn: number }[]>
  >({});
  const [pendingFiles, setPendingFiles] = useState<
    { id: string; filename: string; size: number; uploading: boolean }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // What a confirmation dialog is currently asking about, or null when none is
  // open. One piece of state for both kinds of deletion — only ever one dialog
  // is on screen, and holding the action here keeps the dialog itself unaware
  // of what it is confirming.
  // The message a task is being raised from, or null. Holding the message
  // rather than a boolean keeps the modal's inputs prefilled from it without a
  // second copy of the text living in state.
  // Which message author's profile card is open, keyed by the Huly PersonId
  // the message carries. Null when none is open.
  const [profileFor, setProfileFor] = useState<{
    socialId: string;
    name: string;
    avatarUrl: string | null;
  } | null>(null);
  const [profileDraft, setProfileDraft] = useState("");
  const [showNewDm, setShowNewDm] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [taskFromMessage, setTaskFromMessage] = useState<Message | null>(null);
  const [confirming, setConfirming] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [allUsers, setAllUsers] = useState<
    { id: string; name: string; hulySocialId?: string }[]
  >([]);
  // Loaded once on mount, unlike allUsers which only fills when the create-
  // channel modal opens. The profile card needs it too, so it reads this one.
  const [mentionUsers, setMentionUsers] = useState<
    { id: string; name: string; hulySocialId?: string | null }[]
  >([]);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [newChannelTags, setNewChannelTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [newChannelMemberIds, setNewChannelMemberIds] = useState<string[]>([]);
  const [newChannelProfessor, setNewChannelProfessor] = useState(false);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [channelsCollapsed, setChannelsCollapsed] = useState(false);
  const [sortMode, setSortMode] = useState<"name" | "recent">("name");
  const [showChannelMenu, setShowChannelMenu] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const retryDelay = useRef(1000);
  const channelMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (localStorage.getItem("mobion-channels-collapsed") === "true") {
      setChannelsCollapsed(true);
    }
  }, []);

  useEffect(() => {
    fetch("/api/mobion/users/all")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setMentionUsers(data.users ?? []))
      .catch(() => {}); // best-effort — autocomplete just won't open on failure
  }, []);

  useEffect(() => {
    fetch("/api/mobion/auth/me")
      .then((res) => res.json())
      .then((data) => {
        setCurrentUserId(data.user?.id ?? null);
        if (data.user?.role) setRole(data.user.role);
      })
      .catch(() => {});
  }, []);

  const [dmsCollapsed, setDmsCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("mobion-dms-collapsed") === "true") {
      setDmsCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (!showChannelMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (!channelMenuRef.current?.contains(e.target as Node)) {
        setShowChannelMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showChannelMenu]);

  function toggleChannelsCollapsed() {
    setChannelsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("mobion-channels-collapsed", String(next));
      return next;
    });
  }

  function toggleDmsCollapsed() {
    setDmsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("mobion-dms-collapsed", String(next));
      return next;
    });
  }

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      es = new EventSource("/api/mobion/chat/stream");

      // Read marks live in this app's own Postgres, not in Huly, so this is
      // deliberately outside the stream — it must not wait on a chat connection
      // that may never open.
      fetch("/api/mobion/chat/reads")
        .then((res) => (res.ok ? res.json() : { reads: {} }))
        .then(
          (data: {
            reads?: Record<string, number>;
            othersReads?: Record<
              string,
              { userId: string; name: string; lastReadOn: number }[]
            >;
          }) => {
            setReads(data.reads ?? {});
            setOthersReads(data.othersReads ?? {});
          },
        )
        .catch(() => {});

      fetch("/api/mobion/chat/favorites")
        .then((res) => (res.ok ? res.json() : { favorites: [] }))
        .then((data: { favorites?: string[] }) => setFavorites(data.favorites ?? []))
        .catch(() => {});

      es.addEventListener("snapshot", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setChannels(data.channels);
        setMessages(data.messages);
        // a reconnect re-snapshots the recent end only, so anything paged in
        // before is gone and those conversations can have more above again
        setExhausted({});
        setPerSpaceLimit(data.perSpaceLimit ?? 0);
        setActiveChannelId((prev) => prev ?? data.channels[0]?.id ?? null);
        setConnectionError(null);
        setReconnecting(false);
        retryDelay.current = 1000;
      });

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

      es.addEventListener("channel_added", (e) => {
        const channel = JSON.parse((e as MessageEvent).data) as Channel;
        setChannels((prev) => (prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]));
      });

      es.addEventListener("presence", (e) => {
        const { channelId, online } = JSON.parse((e as MessageEvent).data);
        setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, online } : c)));
      });

      es.addEventListener("error", (e) => {
        const raw = (e as MessageEvent).data;
        if (raw) {
          const data = JSON.parse(raw);
          const knownMessages: Record<string, string> = {
            huly_unavailable: "Huly 연결 실패, 잠시 후 다시 시도해 주세요.",
            not_linked: "Huly 계정이 연결되어 있지 않습니다. 관리자에게 문의해 주세요.",
          };
          setConnectionError(knownMessages[data.message] ?? data.message);
          es?.close();
          return;
        }
        // Browser-level connection drop (not a server-sent error event): reconnect.
        es?.close();
        if (cancelled) return;
        setReconnecting(true);
        retryTimer = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, 30000);
          connect();
        }, retryDelay.current);
      });
    }

    connect();
    return () => {
      cancelled = true;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [refreshToken]);

  async function handleSend() {
    // The box holds "@이름"; the stored form carries the id so a rename never
    // breaks an old mention and so the highlight can tell people apart.
    const text = encodeMentions(draft.trim(), mentionUsers);
    if (!text || !activeChannelId) return;
    setSendError(null);
    const activeChannel = channels.find((c) => c.id === activeChannelId);
    const res = await fetch("/api/mobion/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: activeChannelId,
        channelClass: activeChannel?.kind ?? "channel",
        text,
        replyTo: replyingTo?.id,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSendError(data.error ?? "전송 실패");
      return;
    }
    const sent = await res.json().catch(() => ({}));

    // Files are uploaded while the person is still typing, so they exist before
    // the message does and are joined to it here, once it has an id.
    const ready = pendingFiles.filter((f) => !f.uploading).map((f) => f.id);
    if (sent.messageId && ready.length > 0) {
      await fetch("/api/mobion/chat/attachments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: sent.messageId, attachmentIds: ready }),
      }).catch(() => {});
    }

    setDraft("");
    setReplyingTo(null);
    setPendingFiles([]);
  }

  async function handleReact(messageId: string, emoji: string) {
    const res = await fetch("/api/mobion/chat/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, emoji }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setReactions((prev) => ({ ...prev, [messageId]: data.reactions }));
  }

  async function handleEditMessage(messageId: string, text: string) {
    const res = await fetch("/api/mobion/chat/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, text }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSendError(data.error ?? "수정 실패");
      return false;
    }
    // Reflected locally as well as through the stream: the edit tx reaches this
    // tab as a delta, but the author should not watch their own change lag.
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, text, modifiedOn: Date.now() } : m)),
    );
    return true;
  }

  async function handleDeleteMessage(messageId: string) {
    const res = await fetch(
      `/api/mobion/chat/messages?messageId=${encodeURIComponent(messageId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSendError(data.error ?? "삭제 실패");
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }

  async function handleDeleteChannel(channelId: string) {
    const res = await fetch(
      `/api/mobion/chat/channels?channelId=${encodeURIComponent(channelId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSendError(data.error ?? "채널 삭제 실패");
      return;
    }
    setChannels((prev) => prev.filter((c) => c.id !== channelId));
    setMessages((prev) => prev.filter((m) => m.channelId !== channelId));
    setFavorites((prev) => prev.filter((id) => id !== channelId));
    // Moving off the deleted channel rather than leaving an empty pane that
    // still names something that no longer exists.
    setActiveChannelId((prev) =>
      prev === channelId ? (channels.find((c) => c.id !== channelId)?.id ?? null) : prev,
    );
  }

  /**
   * Opens (or reopens) a direct message with one person.
   *
   * The server returns the existing conversation when there already is one, so
   * pressing this twice lands in the same place rather than splitting the
   * history — the client does not have to track which DMs exist.
   */
  async function startDm(userId: string) {
    setDmError(null);
    const res = await fetch("/api/mobion/chat/dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDmError(data.error ?? "대화를 시작하지 못했습니다.");
      return;
    }
    setShowNewDm(false);
    setMode("chat");
    setActiveChannelId(data.channelId);
    // A brand-new DM is not in this connection's snapshot, which was taken
    // before it existed. Reconnecting is what makes it appear in the list.
    if (!data.existing) setRefreshToken((t) => t + 1);
  }

  /**
   * Opens a DM and sends the first message in one go.
   *
   * The profile card carries its own input rather than a button that takes you
   * elsewhere: the thing you wanted was to say something to this person, and
   * making that two steps (open, then type) puts a screen change in the middle
   * of a single thought.
   */
  async function sendDmFromProfile(userId: string, text: string) {
    setDmError(null);
    const dmRes = await fetch("/api/mobion/chat/dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const dm = await dmRes.json().catch(() => ({}));
    if (!dmRes.ok) {
      setDmError(dm.error ?? "대화를 시작하지 못했습니다.");
      return;
    }

    const sendRes = await fetch("/api/mobion/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: dm.channelId,
        channelClass: "dm",
        text: encodeMentions(text, mentionUsers),
      }),
    });
    if (!sendRes.ok) {
      const err = await sendRes.json().catch(() => ({}));
      setDmError(err.error ?? "메시지를 보내지 못했습니다.");
      return;
    }

    setProfileFor(null);
    setMode("chat");
    setActiveChannelId(dm.channelId);
    // A DM created just now is not in this connection's snapshot.
    if (!dm.existing) setRefreshToken((t) => t + 1);
  }

  async function toggleFavorite(channelId: string) {
    const res = await fetch("/api/mobion/chat/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setFavorites(data.favorites ?? []);
  }

  async function uploadFiles(files: FileList) {
    if (!activeChannelId) return;
    for (const file of Array.from(files)) {
      const placeholder = {
        id: `pending-${Date.now()}-${file.name}`,
        filename: file.name,
        size: file.size,
        uploading: true,
      };
      setPendingFiles((prev) => [...prev, placeholder]);

      // The body is the file itself rather than multipart form data: the server
      // pipes it straight to disk, and multipart would mean parsing a
      // multi-gigabyte body to find the part boundary.
      const res = await fetch(
        `/api/mobion/chat/attachments?channelId=${encodeURIComponent(activeChannelId)}` +
          `&filename=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        },
      ).catch(() => null);

      if (!res?.ok) {
        setPendingFiles((prev) => prev.filter((f) => f.id !== placeholder.id));
        setSendError(`${file.name} 업로드 실패`);
        continue;
      }
      const data = await res.json();
      setPendingFiles((prev) =>
        prev.map((f) =>
          f.id === placeholder.id
            ? { id: data.attachment.id, filename: file.name, size: file.size, uploading: false }
            : f,
        ),
      );
    }
  }

  const lastActivity = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of messages) {
      const prev = map.get(m.channelId) ?? 0;
      if (m.createdOn > prev) map.set(m.channelId, m.createdOn);
    }
    return map;
  }, [messages]);

  const sortedChannels = useMemo(() => {
    const copy = [...channels];
    if (sortMode === "name") {
      copy.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } else {
      copy.sort((a, b) => (lastActivity.get(b.id) ?? 0) - (lastActivity.get(a.id) ?? 0));
    }
    // Pinned channels float to the top of whichever order is in effect, rather
    // than replacing it: someone who sorts by activity still wants their pinned
    // channels ordered by activity among themselves.
    const pinned = new Set(favorites);
    return copy.sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));
  }, [channels, sortMode, lastActivity, favorites]);

  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of channels) for (const t of c.tags) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [channels]);

  const visibleChannelsOnly = useMemo(
    () =>
      sortedChannels.filter(
        (c) => c.kind === "channel" && activeTagFilters.every((t) => c.tags.includes(t)),
      ),
    [sortedChannels, activeTagFilters],
  );
  // DMs are never affected by the channel tag filter (DMs carry no tags) —
  // filtering them through the same .every() would hide every DM whenever any
  // tag filter is active, since an empty tags array never satisfies a
  // non-empty filter list.
  const visibleDms = useMemo(
    () => sortedChannels.filter((c) => c.kind === "dm"),
    [sortedChannels],
  );

  function toggleTagFilter(tag: string) {
    setActiveTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function openCreateChannel() {
    setCreateChannelError(null);
    setNewChannelName("");
    setNewChannelDescription("");
    setNewChannelTags([]);
    setNewTagInput("");
    setNewChannelPrivate(false);
    setNewChannelMemberIds([]);
    setNewChannelProfessor(false);
    setShowCreateChannel(true);
    fetch("/api/mobion/users")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => setAllUsers(data.users ?? []))
      .catch(() => setCreateChannelError("사용자 목록을 불러오지 못했습니다."));
  }

  async function handleCreateChannel() {
    setCreateChannelError(null);
    setCreatingChannel(true);
    try {
      const res = await fetch("/api/mobion/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newChannelName.trim(),
          isPrivate: newChannelPrivate,
          memberIds: newChannelMemberIds,
          visibleToProfessor: newChannelProfessor,
          description: newChannelDescription.trim(),
          tags: newChannelTags,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateChannelError(data.error ?? "요청에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      setShowCreateChannel(false);
    } catch {
      setCreateChannelError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setCreatingChannel(false);
    }
  }

  function toggleMember(id: string) {
    setNewChannelMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  function addTag() {
    const tag = newTagInput.trim();
    setNewTagInput("");
    if (!tag || newChannelTags.includes(tag)) return;
    setNewChannelTags((prev) => [...prev, tag]);
  }

  function removeTag(tag: string) {
    setNewChannelTags((prev) => prev.filter((t) => t !== tag));
  }

  /**
   * Turns a message into a task without leaving the conversation behind.
   *
   * The text becomes the title, trimmed to what a title can hold, and the full
   * message is kept as the excerpt so the task still reads sensibly on its own.
   * The channel is recorded so the task can point back at where it was decided.
   */
  /**
   * Opens the task form over the conversation instead of switching to it.
   *
   * Switching first meant pressing the button threw you out of the chat before
   * you had agreed to make anything, and backing out left you on another
   * screen. The move to the task screen happens after the task exists.
   */
  function raiseTaskFromMessage(m: Message) {
    setTaskFromMessage(m);
  }

  // Cmd+K on macOS, Ctrl+K elsewhere. Bound to the document so it works from
  // any mode, including while a modal has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /** Search results live in four different places; each opens where it lives. */
  function openSearchResult(r: SearchResult) {
    if (r.kind === "contest") {
      setMode("contests");
      return;
    }
    if (!r.projectId) return;
    setMode("projects");
    if (r.kind === "task") tasksData.openTaskInProject(r.projectId, r.id);
    else if (r.kind === "milestone") tasksData.openMilestoneInProject(r.projectId, r.id);
    else tasksData.setSelectedProjectId(r.projectId);
  }

  const messageListRef = useRef<HTMLDivElement>(null);

  const activeMessages = messages
    .filter((m) => m.channelId === activeChannelId)
    .sort((a, b) => a.createdOn - b.createdOn);

  // Reactions, attachments and reply links for whatever is on screen, fetched
  // in one request each rather than per message. Keyed on the id list so
  // switching channels or paging older messages refetches, but a re-render
  // that changes nothing does not.
  // Messages carry a Huly PersonId as authorId, not this app's user id, so
  // "is this mine" is answered by finding my own name among the loaded
  // messages' authors — the snapshot already resolves each id to a name.
  const myName = allUsers.find((u) => u.id === currentUserId)?.name ?? null;
  const mySocialId = useMemo(
    () => messages.find((m) => m.authorName != null && m.authorName === myName)?.authorId ?? null,
    [messages, myName],
  );

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

  // Clicking a notification should land on the conversation it came from.
  useEffect(
    () =>
      onDesktopChannelOpen((channelId) => {
        setMode("chat");
        setActiveChannelId(channelId);
      }),
    [],
  );

  /** Who, other than the author, has read past this message. */
  function readersOf(m: Message) {
    return (othersReads[m.channelId] ?? [])
      .filter((r) => r.lastReadOn >= m.createdOn)
      .map((r) => r.name);
  }

  const visibleIds = activeMessages.map((m) => m.id).join(",");
  useEffect(() => {
    if (!visibleIds) return;
    let cancelled = false;

    fetch(`/api/mobion/chat/reactions?messageIds=${encodeURIComponent(visibleIds)}`)
      .then((res) => (res.ok ? res.json() : { reactions: {} }))
      .then((data) => {
        if (!cancelled) setReactions((prev) => ({ ...prev, ...(data.reactions ?? {}) }));
      })
      .catch(() => {});

    fetch(`/api/mobion/chat/attachments?messageIds=${encodeURIComponent(visibleIds)}`)
      .then((res) => (res.ok ? res.json() : { attachments: {} }))
      .then((data) => {
        if (!cancelled) setAttachments((prev) => ({ ...prev, ...(data.attachments ?? {}) }));
      })
      .catch(() => {});

    fetch(`/api/mobion/chat/replies?messageIds=${encodeURIComponent(visibleIds)}`)
      .then((res) => (res.ok ? res.json() : { replies: {} }))
      .then((data) => {
        if (!cancelled) setReplyOf((prev) => ({ ...prev, ...(data.replies ?? {}) }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [visibleIds]);

  // Keyed on the newest message rather than the array: paging older ones in
  // changes `messages` too, and scrolling to the bottom for that would throw
  // away the position of whoever is reading backwards.
  const newestMessageId = activeMessages[activeMessages.length - 1]?.id ?? null;
  const newestMessageOn = activeMessages[activeMessages.length - 1]?.createdOn ?? 0;
  // `mode` belongs in here: switching to projects unmounts the message list, so
  // coming back remounts it scrolled to the top unless this runs again.
  useEffect(() => {
    const el = messageListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestMessageId, activeChannelId, mode]);

  /**
   * Mark a conversation read up to its newest message.
   *
   * Applied locally first and never awaited by the caller: the badge
   * disappearing is the whole feedback, and making it wait on a round trip
   * would leave a stale count sitting under the cursor after the click.
   */
  function markRead(channelId: string, upTo: number) {
    if (!upTo || (reads[channelId] ?? 0) >= upTo) return;
    setReads((prev) => ({ ...prev, [channelId]: Math.max(prev[channelId] ?? 0, upTo) }));
    fetch("/api/mobion/chat/reads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, lastReadOn: upTo }),
    }).catch(() => {});
  }

  // Reading is looking at it: whatever is open and on screen counts as read,
  // including messages that arrive while it stays open.
  useEffect(() => {
    if (mode !== "chat" || !activeChannelId || !newestMessageOn) return;
    markRead(activeChannelId, newestMessageOn);
    // markRead is a no-op once the mark has caught up, so leaving `reads` out
    // is what stops this from re-running itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeChannelId, newestMessageOn]);

  function unreadCount(channelId: string) {
    if (channelId === activeChannelId && mode === "chat") return 0;
    const since = reads[channelId] ?? 0;
    return messages.filter((m) => m.channelId === channelId && m.createdOn > since).length;
  }

  // The badge mirrors what the channel list already shows, summed. Sent on
  // change rather than polled — these numbers recompute here anyway.
  const totalUnread = channels.reduce((sum, c) => sum + unreadCount(c.id), 0);
  useEffect(() => {
    setDesktopBadge(totalUnread);
  }, [totalUnread]);

  function unreadLabel(count: number) {
    // the snapshot only carried so much, so a count at the cap is a floor
    return perSpaceLimit > 0 && count >= perSpaceLimit ? `${perSpaceLimit}+` : String(count);
  }

  async function loadOlderMessages() {
    if (!activeChannelId || loadingOlder) return;
    const channelId = activeChannelId;
    const el = messageListRef.current;
    const heightBefore = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const params = new URLSearchParams({ channelId });
      const oldest = activeMessages[0];
      if (oldest) params.set("before", String(oldest.createdOn));
      const res = await fetch(`/api/mobion/chat/messages?${params}`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const older = (data.messages ?? []) as Message[];
      if (data.exhausted) setExhausted((prev) => ({ ...prev, [channelId]: true }));
      if (older.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !seen.has(m.id)), ...prev];
        });
        // the list just grew above the viewport; without this the reader is
        // pushed down by exactly the height of what was added
        requestAnimationFrame(() => {
          const node = messageListRef.current;
          if (node) node.scrollTop += node.scrollHeight - heightBefore;
        });
      }
    } catch {
      setSendError("이전 메시지를 불러오지 못했습니다.");
    } finally {
      setLoadingOlder(false);
    }
  }
  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const messageGroups = groupMessages(activeMessages);
  const knownUserIds = new Set(mentionUsers.map((u) => u.id));

  return (
    <Root>
      {reconnecting && <ReconnectBanner>재연결 중...</ReconnectBanner>}
      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} onSelect={openSearchResult} />
      )}
      <Layout>
        <IconRail>
          <RailButton
            type="button"
            data-active={mode === "home" || undefined}
            onClick={() => setMode("home")}
            aria-label={
              homeData.unreadCount > 0 ? `홈 (읽지 않은 알림 ${homeData.unreadCount}건)` : "홈"
            }
            title="홈"
          >
            <span className="material-symbols-outlined">home</span>
            {/* a dot, not a count: the rail is 40px wide and the number is on
                the home screen anyway — what the rail has to answer is only
                whether there is anything there */}
            {homeData.unreadCount > 0 && <RailDot />}
          </RailButton>
          <RailButton
            type="button"
            data-active={mode === "inbox" || undefined}
            onClick={() => setMode("inbox")}
            aria-label={
              homeData.unreadCount > 0
                ? `inbox (읽지 않은 알림 ${homeData.unreadCount}건)`
                : "inbox"
            }
            title="inbox"
          >
            <span className="material-symbols-outlined">inbox</span>
            {/* 홈 버튼과 같은 출처를 쓴다. 알림 폴링이 모든 모드에서 돌기
                때문에 여기서 따로 셀 필요가 없다. */}
            {homeData.unreadCount > 0 && <RailDot />}
          </RailButton>
          <RailButton
            type="button"
            data-active={mode === "chat" || undefined}
            onClick={() => setMode("chat")}
            aria-label="채팅"
            title="채팅"
          >
            <span className="material-symbols-outlined">forum</span>
          </RailButton>
          <RailButton
            type="button"
            data-active={mode === "projects" || undefined}
            onClick={() => setMode("projects")}
            aria-label="프로젝트"
            title="프로젝트"
          >
            <span className="material-symbols-outlined">checklist</span>
          </RailButton>
          <RailButton
            type="button"
            data-active={mode === "schedule" || undefined}
            onClick={() => setMode("schedule")}
            aria-label="일정"
            title="일정"
          >
            <span className="material-symbols-outlined">event</span>
          </RailButton>
          <RailButton
            type="button"
            data-active={mode === "contests" || undefined}
            onClick={() => setMode("contests")}
            aria-label="대회"
            title="대회"
          >
            <span className="material-symbols-outlined">emoji_events</span>
          </RailButton>
          <RailButton
            type="button"
            data-active={mode === "lab" || undefined}
            onClick={() => setMode("lab")}
            aria-label="랩"
            title="랩"
          >
            <span className="material-symbols-outlined">meeting_room</span>
          </RailButton>
          {/* Hidden rather than disabled for everyone else: a control that is
              visible but refuses is an invitation to wonder what is behind it,
              and the server checks the role regardless of what the rail shows. */}
          {canOversee && (
            <RailButton
              type="button"
              data-active={mode === "overview" || undefined}
              onClick={() => setMode("overview")}
              aria-label="연구실 현황"
              title="연구실 현황"
            >
              <span className="material-symbols-outlined">groups</span>
            </RailButton>
          )}
          {/* 알림함은 화면을 바꾸지 않는다 — 보던 자리를 떠나지 않고 곁눈질하는
              도구라, 모드 버튼들과 떨어뜨려 바닥에 혼자 둔다. margin-top: auto가
              위에 버튼이 몇 개든 바닥에 붙여준다. */}
          <TrayButton
            type="button"
            data-tray-toggle
            data-active={trayOpen || undefined}
            onClick={() => setTrayOpen((open) => !open)}
            aria-label={
              homeData.unreadCount > 0
                ? `알림함 (읽지 않은 알림 ${homeData.unreadCount}건)`
                : "알림함"
            }
            aria-expanded={trayOpen}
            title="알림함"
          >
            <span className="material-symbols-outlined">notifications</span>
            {homeData.unreadCount > 0 && <RailDot />}
          </TrayButton>
          {trayOpen && (
            <NotificationTray
              data={homeData}
              onClose={() => setTrayOpen(false)}
              onOpenTask={(projectId, taskId, commentId) => {
                tasksData.openTaskInProject(projectId, taskId, commentId);
                setMode("projects");
              }}
              onOpenInbox={() => setMode("inbox")}
            />
          )}
        </IconRail>
        {mode === "projects" && (
          <>
            <ProjectSidebarList data={tasksData} />
            <ProjectDetailView
              data={tasksData}
              canDelete={role === "lead"}
              onOpenChannel={(channelId) => {
                setActiveChannelId(channelId);
                setMode("chat");
              }}
            />
          </>
        )}
        {mode === "home" && (
          <HomeView
            data={homeData}
            // home only points at things; opening one switches to the view that
            // owns it and selects it there
            onOpenTask={(projectId, taskId, commentId) => {
              tasksData.openTaskInProject(projectId, taskId, commentId);
              setMode("projects");
            }}
          />
        )}
        {mode === "inbox" && (
          <InboxView
            data={inboxData}
            unreadCount={homeData.unreadCount}
            onOpen={(projectId, taskId, commentId) => {
              tasksData.openTaskInProject(projectId, taskId, commentId);
              setMode("projects");
            }}
          />
        )}
        {mode === "contests" && <ContestsView data={contestsData} />}
        {mode === "lab" && <LabView data={labData} />}
        {mode === "overview" && canOversee && (
          <OverviewView
            data={overviewData}
            onOpenTask={(projectId, taskId) => {
              setMode("projects");
              tasksData.openTaskInProject(projectId, taskId);
            }}
          />
        )}
        {mode === "schedule" && (
          <ScheduleView
            data={scheduleData}
            // the schedule spans projects, so opening one means switching mode
            // and selecting it — the projects view then loads its detail
            onOpenProject={(projectId) => {
              tasksData.setSelectedProjectId(projectId);
              setMode("projects");
            }}
          />
        )}
        {mode === "chat" && connectionError && (
          <ChatUnavailable>
            <ErrorBanner>{connectionError}</ErrorBanner>
            <ChatUnavailableHint>
              프로젝트·일정·대회는 왼쪽 레일에서 계속 사용할 수 있습니다
            </ChatUnavailableHint>
          </ChatUnavailable>
        )}
        {mode === "chat" && !connectionError && (
          <>
        <Sidebar>
          <SectionHeader ref={channelMenuRef}>
            <SectionTitle type="button" onClick={toggleChannelsCollapsed}>
              <Chevron data-collapsed={channelsCollapsed || undefined}>
                <span className="material-symbols-outlined">expand_more</span>
              </Chevron>
              채널
            </SectionTitle>
            <SectionActions>
              <IconButton
                type="button"
                onClick={() => setShowChannelMenu((v) => !v)}
                aria-label="채널 메뉴"
              >
                <span className="material-symbols-outlined">more_vert</span>
              </IconButton>
              <IconButton type="button" onClick={openCreateChannel} aria-label="채널 추가">
                <span className="material-symbols-outlined">add</span>
              </IconButton>
            </SectionActions>
            {showChannelMenu && (
              <ChannelMenu>
                <ChannelMenuItem
                  type="button"
                  data-active={sortMode === "name" || undefined}
                  onClick={() => {
                    setSortMode("name");
                    setShowChannelMenu(false);
                  }}
                >
                  <span className="material-symbols-outlined">sort_by_alpha</span>
                  이름순
                  {sortMode === "name" && (
                    <ActiveCheck className="material-symbols-outlined">check</ActiveCheck>
                  )}
                </ChannelMenuItem>
                <ChannelMenuItem
                  type="button"
                  data-active={sortMode === "recent" || undefined}
                  onClick={() => {
                    setSortMode("recent");
                    setShowChannelMenu(false);
                  }}
                >
                  <span className="material-symbols-outlined">history</span>
                  최근 활동순
                  {sortMode === "recent" && (
                    <ActiveCheck className="material-symbols-outlined">check</ActiveCheck>
                  )}
                </ChannelMenuItem>
                <ChannelMenuDivider />
                <ChannelMenuItem
                  type="button"
                  onClick={() => {
                    setRefreshToken((n) => n + 1);
                    setShowChannelMenu(false);
                  }}
                >
                  <span className="material-symbols-outlined">refresh</span>
                  새로고침
                </ChannelMenuItem>
              </ChannelMenu>
            )}
          </SectionHeader>
          {!channelsCollapsed && allTags.length > 0 && (
            <TagFilterRow>
              {allTags.map((tag) => (
                <TagFilterChip
                  key={tag}
                  type="button"
                  data-active={activeTagFilters.includes(tag) || undefined}
                  onClick={() => toggleTagFilter(tag)}
                >
                  {tag}
                </TagFilterChip>
              ))}
            </TagFilterRow>
          )}
          {!channelsCollapsed &&
            visibleChannelsOnly.map((c) => (
              <ChannelItem
                key={c.id}
                role="button"
                tabIndex={0}
                aria-pressed={c.id === activeChannelId}
                data-active={c.id === activeChannelId || undefined}
                onClick={() => setActiveChannelId(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveChannelId(c.id);
                  }
                }}
              >
                # {c.name}
                {unreadCount(c.id) > 0 && (
                  <UnreadBadge>{unreadLabel(unreadCount(c.id))}</UnreadBadge>
                )}
                {/* stopPropagation so pinning does not also switch channels —
                    the star sits inside the row that selects it */}
                <PinButton
                  type="button"
                  data-pinned={favorites.includes(c.id) || undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleFavorite(c.id);
                  }}
                  aria-label={favorites.includes(c.id) ? "즐겨찾기 해제" : "즐겨찾기"}
                  title={favorites.includes(c.id) ? "즐겨찾기 해제" : "즐겨찾기"}
                >
                  <span className="material-symbols-outlined">
                    {favorites.includes(c.id) ? "star" : "star_border"}
                  </span>
                </PinButton>
              </ChannelItem>
            ))}

          <SectionHeader>
            <SectionTitle type="button" onClick={toggleDmsCollapsed}>
              <Chevron data-collapsed={dmsCollapsed || undefined}>
                <span className="material-symbols-outlined">expand_more</span>
              </Chevron>
              직접 메시지
            </SectionTitle>
            <IconButton
              type="button"
              onClick={() => {
                setDmError(null);
                setShowNewDm(true);
              }}
              aria-label="새 대화"
              title="새 대화"
            >
              <span className="material-symbols-outlined">add</span>
            </IconButton>
          </SectionHeader>
          {!dmsCollapsed &&
            visibleDms.map((c) => (
              <ChannelItem
                key={c.id}
                role="button"
                tabIndex={0}
                aria-pressed={c.id === activeChannelId}
                data-active={c.id === activeChannelId || undefined}
                onClick={() => setActiveChannelId(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveChannelId(c.id);
                  }
                }}
              >
                <PresenceDot data-online={c.online || undefined} />
                {c.name}
                {unreadCount(c.id) > 0 && (
                  <UnreadBadge>{unreadLabel(unreadCount(c.id))}</UnreadBadge>
                )}
              </ChannelItem>
            ))}
        </Sidebar>
        <Main>
          <ChannelHeader>
            {activeChannel ? (
              <>
                <ChannelHeaderTitle>
                  {activeChannel.kind === "dm" ? "@" : "#"} {activeChannel.name}
                </ChannelHeaderTitle>
                {activeChannel.description && (
                  <ChannelHeaderDescription>
                    {activeChannel.description}
                  </ChannelHeaderDescription>
                )}
                {/* In the header rather than beside each row in the list: a
                    channel is deleted rarely and deliberately, so the control
                    belongs where you have already opened the thing. DMs have
                    no delete — there is no "creator" to own one. */}
                <ChannelDeleteButton
                  type="button"
                  onClick={() =>
                    setConfirming(
                      activeChannel.kind === "dm"
                        ? {
                            title: `${activeChannel.name} 님과의 대화를 삭제할까요?`,
                            // Said plainly: this is not "leave", and the other
                            // person does not get to keep their copy.
                            description:
                              "주고받은 메시지와 파일이 모두 지워지고, 상대방에게서도 사라집니다.\n되돌릴 수 없습니다.",
                            onConfirm: () => {
                              void handleDeleteChannel(activeChannel.id);
                              setConfirming(null);
                            },
                          }
                        : {
                            title: `#${activeChannel.name} 채널을 삭제할까요?`,
                            description:
                              "채널의 모든 메시지와 올린 파일이 함께 지워집니다.\n되돌릴 수 없습니다.",
                            onConfirm: () => {
                              void handleDeleteChannel(activeChannel.id);
                              setConfirming(null);
                            },
                          },
                    )
                  }
                  aria-label={activeChannel.kind === "dm" ? "대화 삭제" : "채널 삭제"}
                  title={activeChannel.kind === "dm" ? "대화 삭제" : "채널 삭제"}
                >
                  <span className="material-symbols-outlined">delete</span>
                </ChannelDeleteButton>
              </>
            ) : (
              <ChannelHeaderTitle>채널을 선택하거나 새로 만들어 보세요</ChannelHeaderTitle>
            )}
          </ChannelHeader>
          <MessageList ref={messageListRef}>
            {/* A button rather than a scroll trigger: loading on scroll fights
                the auto-scroll above and fires on every bounce at the top. */}
            {activeChannel && !exhausted[activeChannel.id] && activeMessages.length > 0 && (
              <LoadOlderRow>
                <LoadOlderButton type="button" onClick={loadOlderMessages} disabled={loadingOlder}>
                  {loadingOlder ? "불러오는 중..." : "이전 메시지 더 보기"}
                </LoadOlderButton>
              </LoadOlderRow>
            )}
            {messageGroups.map((g, gi) => (
              <MessageGroupBlock key={gi}>
                {/* Avatar and name open a profile card, the way Discord does —
                    the person you want to message is usually the one whose
                    message you are already looking at. */}
                <ProfileTrigger
                  type="button"
                  onClick={() =>
                    setProfileFor({
                      socialId: g.authorId,
                      name: g.authorName ?? "알 수 없음",
                      avatarUrl: g.authorAvatarUrl,
                    })
                  }
                  aria-label={`${g.authorName ?? "알 수 없음"} 프로필`}
                >
                  {g.authorAvatarUrl ? (
                    <Avatar src={g.authorAvatarUrl} alt="" />
                  ) : (
                    <AvatarFallback style={{ background: avatarColor(g.authorId) }}>
                      {(g.authorName ?? "?").charAt(0)}
                    </AvatarFallback>
                  )}
                </ProfileTrigger>
                <MessageBody>
                  <MessageMeta>
                    <NameTrigger
                      type="button"
                      onClick={() =>
                        setProfileFor({
                          socialId: g.authorId,
                          name: g.authorName ?? "알 수 없음",
                          avatarUrl: g.authorAvatarUrl,
                        })
                      }
                    >
                      <MessageAuthor>{g.authorName ?? "알 수 없음"}</MessageAuthor>
                    </NameTrigger>
                    <MessageTime>{formatTime(g.messages[0].createdOn)}</MessageTime>
                  </MessageMeta>
                  {g.messages.map((m, mi) => {
                    const parentId = replyOf[m.id];
                    const parent = parentId
                      ? messages.find((x) => x.id === parentId)
                      : undefined;
                    return (
                      <ChatMessageRow
                        key={m.id}
                        message={m}
                        showTimestamp={mi > 0}
                        timestamp={formatTime(m.createdOn)}
                        mentionsMe={Boolean(
                          currentUserId && messageContainsMentionOf(m.text, currentUserId),
                        )}
                        isMine={m.authorId === mySocialId}
                        canDelete={m.authorId === mySocialId || role === "lead"}
                        reactions={reactions[m.id] ?? []}
                        attachments={attachments[m.id] ?? []}
                        quoted={
                          parent
                            ? {
                                authorName: parent.authorName,
                                text: mentionPlainText(parent.text),
                              }
                            : null
                        }
                        plainText={mentionPlainText(m.text)}
                        readBy={readersOf(m)}
                        renderText={(text) =>
                          renderMessageText(text, knownUserIds, (userId, name) => {
                            // The profile card is keyed by Huly PersonId; a
                            // mention carries this app's user id, so it is
                            // translated here. An unlinked account resolves to
                            // an empty id and the card says why it cannot DM.
                            const u = mentionUsers.find((x) => x.id === userId);
                            setProfileFor({
                              socialId: u?.hulySocialId ?? "",
                              name,
                              avatarUrl: null,
                            });
                          })
                        }
                        onReact={(emoji) => void handleReact(m.id, emoji)}
                        onReply={() => setReplyingTo(m)}
                        onEdit={(text) =>
                          handleEditMessage(m.id, encodeMentions(text, mentionUsers))
                        }
                        onDelete={() =>
                          setConfirming({
                            title: "메시지를 삭제할까요?",
                            // shows the message itself, trimmed — confirming a
                            // deletion you cannot see is confirming nothing
                            description: (() => {
                              // the reader has to recognise the message, so it
                              // is shown the way they saw it, not as stored
                              const plain = mentionPlainText(m.text);
                              return `"${plain.slice(0, 80)}${plain.length > 80 ? "…" : ""}"\n\n삭제하면 되돌릴 수 없습니다.`;
                            })(),
                            onConfirm: () => {
                              void handleDeleteMessage(m.id);
                              setConfirming(null);
                            },
                          })
                        }
                        /* the point of having chat and projects in one place:
                           something decided in conversation becomes work
                           without being retyped somewhere else */
                        onRaiseTask={() => raiseTaskFromMessage(m)}
                      />
                    );
                  })}
                </MessageBody>
              </MessageGroupBlock>
            ))}
          </MessageList>
          <Composer>
            {replyingTo && (
              <ReplyBar>
                <span className="material-symbols-outlined">reply</span>
                <ReplyTarget>
                  <strong>{replyingTo.authorName ?? "알 수 없음"}</strong>
                  <ReplyPreview>{mentionPlainText(replyingTo.text)}</ReplyPreview>
                </ReplyTarget>
                <ComposerIcon
                  type="button"
                  data-compact
                  onClick={() => setReplyingTo(null)}
                  aria-label="답장 취소"
                >
                  <span className="material-symbols-outlined">close</span>
                </ComposerIcon>
              </ReplyBar>
            )}

            {pendingFiles.length > 0 && (
              <PendingFiles>
                {pendingFiles.map((f) => (
                  <PendingChip key={f.id} data-uploading={f.uploading || undefined}>
                    <span className="material-symbols-outlined">
                      {f.uploading ? "progress_activity" : "attach_file"}
                    </span>
                    {f.filename}
                    {!f.uploading && (
                      <ComposerIcon
                        type="button"
                        data-compact
                        onClick={() =>
                          setPendingFiles((prev) => prev.filter((p) => p.id !== f.id))
                        }
                        aria-label="첨부 취소"
                      >
                        <span className="material-symbols-outlined">close</span>
                      </ComposerIcon>
                    )}
                  </PendingChip>
                ))}
              </PendingFiles>
            )}

            <ComposerRow>
              <ComposerIcon
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="파일 첨부"
                title="파일 첨부"
              >
                <span className="material-symbols-outlined">attach_file</span>
              </ComposerIcon>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) void uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <MentionInput
                value={draft}
                onChange={setDraft}
                onSend={handleSend}
                users={mentionUsers}
              />
              <SendButton
                onClick={handleSend}
                disabled={!draft.trim() && pendingFiles.length === 0}
              >
                보내기
              </SendButton>
            </ComposerRow>
          </Composer>
          {sendError && <SendErrorText>{sendError}</SendErrorText>}
        </Main>
          </>
        )}
      </Layout>
      {profileFor && (() => {
        // The message carries a Huly PersonId; the DM route wants this app's
        // user id. mentionUsers ships hulySocialId so the two can be joined —
        // and unlike allUsers it is loaded on mount, so the card can rely on it.
        const person = mentionUsers.find((u) => u.hulySocialId === profileFor.socialId);
        const isMe = person?.id === currentUserId;
        const canDm = Boolean(person && !isMe && person.hulySocialId);
        return (
          <ModalOverlay
            onClick={() => {
              setProfileFor(null);
              setProfileDraft("");
            }}
          >
            <ProfileCard onClick={(e) => e.stopPropagation()}>
              {/* A banner in the person's own colour, the same one their avatar
                  falls back to — so the card reads as theirs at a glance. */}
              <ProfileBanner style={{ background: avatarColor(profileFor.socialId) }} />
              <ProfileBody>
                {profileFor.avatarUrl ? (
                  <ProfileAvatar src={profileFor.avatarUrl} alt="" />
                ) : (
                  <ProfileAvatarFallback
                    style={{ background: avatarColor(profileFor.socialId) }}
                  >
                    {profileFor.name.charAt(0)}
                  </ProfileAvatarFallback>
                )}
                <ProfileName>{profileFor.name}</ProfileName>
                {isMe && <ProfileNote>나</ProfileNote>}
                {!isMe && !canDm && (
                  <ProfileNote>아직 채팅이 연결되지 않은 계정입니다.</ProfileNote>
                )}
                {dmError && <SendErrorText>{dmError}</SendErrorText>}

                {canDm && person && (
                  <ProfileComposer>
                    <ProfileInput
                      value={profileDraft}
                      autoFocus
                      placeholder={`@${profileFor.name} 님에게 메시지 보내기`}
                      onChange={(e) => setProfileDraft(e.target.value)}
                      onKeyDown={(e) => {
                        // same IME guard as everywhere else a Korean sentence
                        // meets Enter
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          const text = profileDraft.trim();
                          if (!text) return;
                          setProfileDraft("");
                          void sendDmFromProfile(person.id, text);
                        }
                      }}
                    />
                  </ProfileComposer>
                )}
              </ProfileBody>
            </ProfileCard>
          </ModalOverlay>
        );
      })()}
      {showNewDm && (
        <ModalOverlay onClick={() => setShowNewDm(false)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 대화</ModalTitle>
            {/* No search box: the lab is five people, and a filter over five
                names is more to look at than the names themselves. */}
            <DmPeople>
              {allUsers
                .filter((u) => u.id !== currentUserId)
                .map((u) => (
                  <DmPerson key={u.id} type="button" onClick={() => void startDm(u.id)}>
                    <DmAvatar style={{ background: avatarColor(u.id) }}>
                      {u.name.charAt(0)}
                    </DmAvatar>
                    {u.name}
                  </DmPerson>
                ))}
              {allUsers.filter((u) => u.id !== currentUserId).length === 0 && (
                <DmEmpty>대화할 수 있는 사람이 없습니다.</DmEmpty>
              )}
            </DmPeople>
            {dmError && <SendErrorText>{dmError}</SendErrorText>}
            <ModalActions>
              <button type="button" onClick={() => setShowNewDm(false)}>
                닫기
              </button>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
      {taskFromMessage && (
        <ChatTaskModal
          excerpt={mentionPlainText(taskFromMessage.text).trim()}
          channelId={taskFromMessage.channelId}
          messageId={taskFromMessage.id}
          onCreated={(projectId) => {
            setTaskFromMessage(null);
            // Now the move is worth making: there is something to look at.
            tasksData.setSelectedProjectId(projectId);
            setMode("projects");
          }}
          onClose={() => setTaskFromMessage(null)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={confirming.title}
          description={confirming.description}
          onConfirm={confirming.onConfirm}
          onCancel={() => setConfirming(null)}
        />
      )}
      {showCreateChannel && (
        <CreateChannelModal
          name={newChannelName}
          setName={setNewChannelName}
          description={newChannelDescription}
          setDescription={setNewChannelDescription}
          tagInput={newTagInput}
          setTagInput={setNewTagInput}
          tags={newChannelTags}
          addTag={addTag}
          removeTag={removeTag}
          isPrivate={newChannelPrivate}
          setIsPrivate={setNewChannelPrivate}
          allUsers={allUsers}
          memberIds={newChannelMemberIds}
          toggleMember={toggleMember}
          professor={newChannelProfessor}
          setProfessor={setNewChannelProfessor}
          error={createChannelError}
          creating={creatingChannel}
          onCreate={handleCreateChannel}
          onClose={() => setShowCreateChannel(false)}
        />
      )}
    </Root>
  );
}

type CreateChannelModalProps = {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  tags: string[];
  addTag: () => void;
  removeTag: (tag: string) => void;
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
  allUsers: { id: string; name: string }[];
  memberIds: string[];
  toggleMember: (id: string) => void;
  professor: boolean;
  setProfessor: (v: boolean) => void;
  error: string | null;
  creating: boolean;
  onCreate: () => void;
  onClose: () => void;
};

/**
 * Module scope, like the project/milestone/task modals: defined inside
 * MobiOnContent it would be a fresh component type on every render, remounting
 * mid-typing and dropping input focus.
 */
function CreateChannelModal(props: CreateChannelModalProps) {
  const { overlayRef, cardRef, close } = useModalEnterAnimation(props.onClose);
  useCloseOnEscape(close);

  return (
        <ModalOverlay ref={overlayRef} onClick={close}>
          <ModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 채널 만들기</ModalTitle>
      <Field>
        <label htmlFor="new-channel-name">채널 이름</label>
        <input
          id="new-channel-name"
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
        />
      </Field>
      <Field>
        <label htmlFor="new-channel-description">설명</label>
        <input
          id="new-channel-description"
          value={props.description}
          onChange={(e) => props.setDescription(e.target.value)}
          placeholder="채널 설명 (선택)"
        />
      </Field>
      <Field>
        <label htmlFor="new-channel-tags">태그</label>
        <input
          id="new-channel-tags"
          value={props.tagInput}
          onChange={(e) => props.setTagInput(e.target.value)}
          onKeyDown={(e) => {
            // same IME guard as MentionInput: the composition-commit Enter
            // would otherwise add a Korean tag twice
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              props.addTag();
            }
          }}
          placeholder="태그 입력 후 엔터"
        />
        {props.tags.length > 0 && (
          <TagChipRow>
            {props.tags.map((tag) => (
              <TagChip key={tag}>
                {tag}
                <TagChipRemove type="button" onClick={() => props.removeTag(tag)}>
                  ×
                </TagChipRemove>
              </TagChip>
            ))}
          </TagChipRow>
        )}
      </Field>
      <RadioRow>
        <CheckRow>
          <HiddenInput
            type="radio"
            name="channel-visibility"
            checked={!props.isPrivate}
            onChange={() => props.setIsPrivate(false)}
          />
          <RadioBox />
          공개
        </CheckRow>
        <CheckRow>
          <HiddenInput
            type="radio"
            name="channel-visibility"
            checked={props.isPrivate}
            onChange={() => props.setIsPrivate(true)}
          />
          <RadioBox />
          비공개
        </CheckRow>
      </RadioRow>
      {props.isPrivate && (
        <>
          <MemberList>
            {props.allUsers.map((u) => (
              <CheckRow key={u.id}>
                <HiddenInput
                  type="checkbox"
                  checked={props.memberIds.includes(u.id)}
                  onChange={() => props.toggleMember(u.id)}
                />
                <CheckboxBox />
                {u.name}
              </CheckRow>
            ))}
          </MemberList>
          <CheckRow>
            <HiddenInput
              type="checkbox"
              checked={props.professor}
              onChange={(e) => props.setProfessor(e.target.checked)}
            />
            <CheckboxBox />
            교수님에게 공개
          </CheckRow>
        </>
      )}
      {props.error && <SendErrorText>{props.error}</SendErrorText>}
      <ModalActions>
        <button type="button" onClick={props.onClose}>
          취소
        </button>
        <button type="button" onClick={props.onCreate} disabled={props.creating}>
          {props.creating ? "만드는 중..." : "만들기"}
        </button>
      </ModalActions>
      </ModalCard>
    </ModalOverlay>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
  /* Header.tsx's Bar is absolute, top 54px, height 75px, so its bottom edge is
     at 129px. Reading pages clamp up to 189px for breathing room; a workspace
     wants that space for content instead, so it clears the header and stops. */
  padding: 145px 24px 24px;
`;

const ChatUnavailable = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 24px;
  text-align: center;
`;

const ChatUnavailableHint = styled.p`
  color: var(--text-faint);
  font-size: 13px;
`;

const ErrorBanner = styled.div`
  text-align: center;
  color: var(--danger);
  padding: 40px;
`;

const ReconnectBanner = styled.div`
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 8px;
`;

const Layout = styled.div`
  display: flex;
  height: calc(100vh - 169px);
  /* Wide enough to use a laptop screen properly — the old 1156px cap left a
     third of a 1440px window empty — but still capped so rows do not stretch
     to unreadable lengths on a large external display. */
  width: 100%;
  max-width: 1680px;
  margin: 0 auto;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--border-strong);
`;

const IconRail = styled.nav`
  /* 알림함 말풍선이 이 레일을 기준으로 떠오른다 */
  position: relative;
  width: 56px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 0;
  background: var(--panel-wash);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border-right: 1px solid var(--border);
`;

const RailDot = styled.span`
  position: absolute;
  top: 7px;
  right: 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warn);
`;

const RailButton = styled.button`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 22px;
  }

  &:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  &[data-active] {
    background: var(--accent-soft);
    color: var(--accent);
  }
`;

/**
 * 레일 바닥에 홀로 앉는 알림함 버튼.
 *
 * `margin-top: auto`가 위쪽 버튼 개수와 무관하게 바닥으로 밀어낸다 — 연구실
 * 현황 버튼이 랩장에게만 보여 개수가 사람마다 다르므로 고정 여백으로는 맞출
 * 수 없다. 위에 선을 하나 그어 모드 버튼들과 다른 물건임을 보인다.
 */
const TrayButton = styled(RailButton)`
  margin-top: auto;

  &::before {
    content: "";
    position: absolute;
    top: -6px;
    left: 6px;
    right: 6px;
    height: 1px;
    background: var(--border);
  }
`;

const Sidebar = styled.div`
  width: 220px;
  background: var(--panel-wash);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  padding: 12px;
  overflow-y: auto;
`;

const ChannelItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: var(--surface-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  &[data-active] {
    background: var(--accent-soft);
    color: var(--accent);
  }
`;

const PresenceDot = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  background: var(--text-faint);

  &[data-online] {
    background: var(--ok);
    box-shadow: 0 0 4px var(--ok-soft);
  }
`;

const TagFilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
`;

const TagFilterChip = styled.button`
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;

  &:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  &[data-active] {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
`;

const Main = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--panel-wash);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
`;

const ChannelHeader = styled.div`
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-strong);
`;

/* Modelled on Discord's profile popover: a coloured banner, the avatar
   straddling its edge, and — the part that matters — an input right there.
   The thing you wanted was to say something to this person; a button that
   takes you elsewhere puts a screen change in the middle of that. */
const ProfileCard = styled.div`
  width: 320px;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 12px 38px rgba(0, 0, 0, 0.26);
`;

const ProfileBanner = styled.div`
  height: 66px;
`;

const ProfileBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 16px;
`;

const ProfileAvatar = styled.img`
  width: 76px;
  height: 76px;
  margin-top: -38px;
  border-radius: 50%;
  object-fit: cover;
  /* The ring is the card's own background, which is what makes the avatar read
     as sitting on top of the banner rather than punched through it. */
  border: 5px solid var(--surface);
`;

const ProfileAvatarFallback = styled.div`
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  margin-top: -38px;
  border-radius: 50%;
  border: 5px solid var(--surface);
  color: #fff;
  font-size: 28px;
  font-weight: 700;
`;

const ProfileName = styled.div`
  font-size: 19px;
  font-weight: 700;
  color: var(--text-strong);
`;

const ProfileNote = styled.p`
  margin: 0;
  font-size: 12px;
  color: var(--text-faint);
`;

const ProfileComposer = styled.div`
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
`;

const ProfileInput = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--surface-sunken);
  color: var(--text-strong);
  font: inherit;
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: var(--accent);
  }
`;

/* Wraps the name rather than restyling it with `as="button"` — MessageAuthor
   is a span, and giving it a button's props fights its type. */
const NameTrigger = styled.button`
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const ProfileTrigger = styled.button`
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 50%;
  line-height: 0;

  &:hover {
    opacity: 0.85;
  }
`;

const DmPeople = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 300px;
  overflow-y: auto;
`;

const DmPerson = styled.button`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-strong);
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--surface-hover, rgba(127, 127, 127, 0.1));
  }
`;

const DmAvatar = styled.span`
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
`;

const DmEmpty = styled.p`
  margin: 0;
  padding: 12px 4px;
  font-size: 13px;
  color: var(--text-faint);
`;

const ChannelDeleteButton = styled.button`
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border: none;
  border-radius: 7px;
  background: none;
  color: var(--text-faint);
  cursor: pointer;

  &:hover {
    background: rgba(220, 38, 38, 0.1);
    color: #dc2626;
  }

  .material-symbols-outlined {
    font-size: 18px;
  }
`;

const ChannelHeaderTitle = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: var(--text-strong);
`;

const ChannelHeaderDescription = styled.div`
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
`;

const UnreadBadge = styled.span`
  margin-left: auto;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--selected-bg);
  color: var(--text-inverse);
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
`;

const LoadOlderRow = styled.div`
  display: flex;
  justify-content: center;
  padding: 4px 0 10px;
`;

const LoadOlderButton = styled.button`
  padding: 4px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--border-strong);
    color: var(--text);
  }

  &:disabled {
    cursor: default;
  }
`;

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MessageGroupBlock = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

const MessageBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const Avatar = styled.img`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
`;

const AvatarFallback = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--on-solid);
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
`;

const MessageMeta = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
`;

const MessageAuthor = styled.span`
  font-weight: 700;
  font-size: 13px;
  color: var(--accent);
`;

const MessageTime = styled.span`
  font-size: 11px;
  color: var(--text-faint);
`;

const Mention = styled.span`
  color: var(--accent);
  font-weight: 700;

  /* Only the ones wired to a profile look pressable. */
  &[data-clickable] {
    cursor: pointer;
    border-radius: 3px;

    &:hover,
    &:focus-visible {
      background: var(--accent-soft);
    }
  }
`;

/* The reply target and the attachment tray sit above the input rather than
   inside it, the way Slack and Discord do: what you are about to send stays
   visible while you type, and the input itself keeps its full width. */
const ComposerRow = styled.div`
  display: flex;
  gap: 8px;
  /* stretch rather than center: the input, the attach button and 보내기 each
     compute a different height from their own padding, and centering three
     different heights leaves the icons floating off the input's edges. Letting
     them take the row's height makes the input the one thing that decides it. */
  align-items: stretch;
`;

const ReplyBar = styled.div`
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 6px 9px;
  border-left: 2px solid var(--accent, #3b82f6);
  border-radius: 0 7px 7px 0;
  background: var(--surface-sunken);
  font-size: 12px;

  .material-symbols-outlined {
    font-size: 16px;
    color: var(--text-muted, #6b7280);
  }
`;

const ReplyTarget = styled.div`
  display: flex;
  gap: 6px;
  min-width: 0;
  flex: 1;
`;

const ReplyPreview = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted, #6b7280);
`;

const PendingFiles = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const PendingChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 13px;
  font-size: 12px;
  background: var(--surface-sunken);

  .material-symbols-outlined {
    font-size: 15px;
  }

  /* an upload in flight must look different from one that is ready to send,
     because only the finished ones actually attach */
  &[data-uploading] {
    opacity: 0.6;
  }
`;

/* Hidden until the row is hovered, except when it is already pinned — an
   always-visible star on every channel is noise, but a pinned one has to stay
   visible to be unpinnable. */
const PinButton = styled.button`
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  border: none;
  border-radius: 5px;
  background: none;
  color: var(--text-faint, #9aa0a6);
  cursor: pointer;
  opacity: 0;

  &[data-pinned] {
    opacity: 1;
    color: #f0b429;
  }

  *:hover > & {
    opacity: 1;
  }

  .material-symbols-outlined {
    font-size: 16px;
  }
`;

const ComposerIcon = styled.button`
  display: grid;
  place-items: center;
  /* Square, but sized by the row rather than by a number of its own — a fixed
     height here is what stopped it lining up with the input beside it. */
  width: 38px;
  flex: 0 0 auto;
  border: none;
  border-radius: 7px;
  background: none;
  color: var(--text-muted, #6b7280);
  cursor: pointer;

  &:hover {
    background: var(--surface-hover, rgba(127, 127, 127, 0.12));
  }

  .material-symbols-outlined {
    font-size: 18px;
  }

  /* The same button also closes a reply quote and drops a queued file, where
     it sits inside a small chip and must not tower over its own text. */
  &[data-compact] {
    width: 20px;
    height: 20px;
    border-radius: 5px;

    .material-symbols-outlined {
      font-size: 14px;
    }
  }
`;

const Composer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-top: 1px solid var(--border-strong);

  input {
    flex: 1;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid var(--border-strong);
    background: var(--surface-sunken);
    color: var(--text-strong);
    outline: none;
  }

  /* No blanket button rule here. It used to paint every button in the composer
     accent-blue, which was fine when 보내기 was the only one — the attach and
     cancel icons that joined later came out as solid blue blocks. */
`;

const SendButton = styled.button`
  padding: 9px 16px;
  flex: 0 0 auto;
  border: none;
  border-radius: 9px;
  background: var(--accent);
  color: var(--on-solid);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease, opacity 0.12s ease;

  &:hover {
    filter: brightness(1.06);
  }

  /* Nothing to send is a state worth showing: a live-looking button that does
     nothing when pressed reads as the app being broken. */
  &:disabled {
    opacity: 0.45;
    cursor: default;
    filter: none;
  }
`;

const SendErrorText = styled.p`
  padding: 0 12px 12px;
  color: var(--danger);
  font-size: 12px;
`;

const SectionHeader = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const SectionTitle = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 0;

  &:hover {
    color: var(--text);
  }
`;

const Chevron = styled.span`
  display: inline-flex;
  transition: transform 0.15s ease;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &[data-collapsed] {
    transform: rotate(-90deg);
  }
`;

const SectionActions = styled.div`
  display: flex;
  gap: 4px;
`;

const IconButton = styled.button`
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 6px;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover {
    color: var(--accent);
    background: var(--surface-hover);
  }
`;

const ChannelMenu = styled.div`
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  min-width: 170px;
  padding: 6px;
  border-radius: 10px;
  /* Opaque, not the translucent panel wash. A dropdown opens over a list of
     channel names, and at 0.35 alpha in dark mode they showed through its own
     labels. A blur is a nice effect on a large surface; on a 170px menu it just
     makes the text compete with whatever is behind it. */
  background: var(--surface);
  border: 1px solid var(--border-strong);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.16);
`;

const ChannelMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  padding: 7px 8px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;

  > .material-symbols-outlined {
    font-size: 17px;
    color: var(--text-faint);
  }

  &:hover {
    background: var(--surface-hover);
    color: var(--accent);
  }

  &:hover > .material-symbols-outlined {
    color: var(--accent);
  }

  &[data-active] {
    color: var(--accent);
  }
`;

const ActiveCheck = styled.span`
  margin-left: auto;
  color: var(--accent) !important;
`;

const ChannelMenuDivider = styled.div`
  height: 1px;
  margin: 4px 0;
  background: var(--surface-active);
`;





const RadioRow = styled.div`
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: var(--text);

  label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
`;

const MemberList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  font-size: 14px;
  color: var(--text);

  label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
`;

const CheckRow = styled.label`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text);

  &:hover {
    background: var(--surface-hover);
  }
`;

const HiddenInput = styled.input`
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
`;

const CheckboxBox = styled.span`
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 4px;
  border: 1px solid var(--border-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease;

  &::after {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--on-solid);
    opacity: 0;
    transform: scale(0.6);
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  ${HiddenInput}:checked + & {
    background: var(--accent);
    border-color: var(--accent);
  }

  ${HiddenInput}:checked + &::after {
    opacity: 1;
    transform: scale(1);
  }

  ${HiddenInput}:focus-visible + & {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const RadioBox = styled(CheckboxBox)`
  border-radius: 50%;

  &::after {
    border-radius: 50%;
  }
`;

const TagChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const TagChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
`;

const TagChipRemove = styled.button`
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0;
`;

