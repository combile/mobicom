"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import MentionInput from "./MentionInput";
import ProjectSidebarList from "./ProjectSidebarList";
import ProjectDetailView from "./ProjectDetailView";
import { parseMentionSegments, messageContainsMentionOf } from "@/lib/mobion-mentions";
import { useTasksData } from "@/lib/use-tasks-data";
import { useScheduleData } from "@/lib/use-schedule-data";
import ScheduleView from "./ScheduleView";
import { useContestsData } from "@/lib/use-contests-data";
import ContestsView from "./ContestsView";
import { useCloseOnEscape, useModalEnterAnimation } from "@/lib/use-modal-enter-animation";
import { ModalOverlay, ModalCard, ModalTitle, Field, ModalActions } from "./modal-styles";

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

const AVATAR_COLORS = ["#00b5ff", "#ff9d5c", "#8b7cf6", "#4ade80", "#ff6767", "#e5c76b"];

function avatarColor(authorId: string) {
  let hash = 0;
  for (let i = 0; i < authorId.length; i++) hash = (hash * 31 + authorId.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

type MessageGroup = {
  authorId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  messages: Message[];
};

function renderMessageText(text: string, knownUserIds: Set<string>) {
  return parseMentionSegments(text).map((seg, i) => {
    if (seg.type === "text") return <span key={i}>{seg.content}</span>;
    if (!knownUserIds.has(seg.userId)) return <span key={i}>@{seg.name}</span>;
    return <Mention key={i}>@{seg.name}</Mention>;
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
      m.createdOn - lastMessage.createdOn < GROUP_WINDOW_MS
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

type WorkspaceMode = "chat" | "projects" | "schedule" | "contests";

export default function MobiOnContent() {
  const [mode, setMode] = useState<WorkspaceMode>("chat");
  // declared here rather than with the other chat state because useTasksData
  // needs it, and a const cannot be read before its declaration
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const tasksData = useTasksData(mode === "projects", currentUserId);
  const scheduleData = useScheduleData(mode === "schedule");
  const contestsData = useContestsData(mode === "contests");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);
  const [mentionUsers, setMentionUsers] = useState<{ id: string; name: string }[]>([]);
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
      .then((data) => setCurrentUserId(data.user?.id ?? null))
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

      es.addEventListener("snapshot", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setChannels(data.channels);
        setMessages(data.messages);
        setActiveChannelId((prev) => prev ?? data.channels[0]?.id ?? null);
        setConnectionError(null);
        setReconnecting(false);
        retryDelay.current = 1000;
      });

      es.addEventListener("delta", (e) => {
        const msg = JSON.parse((e as MessageEvent).data) as Message;
        setMessages((prev) => [...prev, msg]);
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
    const text = draft.trim();
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
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSendError(data.error ?? "전송 실패");
      return;
    }
    setDraft("");
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
    return copy;
  }, [channels, sortMode, lastActivity]);

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
  function raiseTaskFromMessage(m: Message) {
    const text = m.text.trim();
    tasksData.openCreateTask({
      title: text.slice(0, 80),
      description: text.length > 80 ? text : "",
      sourceChannelId: m.channelId,
      sourceMessageId: m.id,
      sourceExcerpt: text.slice(0, 500),
    });
    setMode("projects");
  }

  const messageListRef = useRef<HTMLDivElement>(null);
  // `mode` belongs in here: switching to projects unmounts the message list, so
  // coming back remounts it scrolled to the top unless this runs again.
  useEffect(() => {
    const el = messageListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeChannelId, mode]);

  const activeMessages = messages
    .filter((m) => m.channelId === activeChannelId)
    .sort((a, b) => a.createdOn - b.createdOn);
  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const messageGroups = groupMessages(activeMessages);
  const knownUserIds = new Set(mentionUsers.map((u) => u.id));

  return (
    <Root>
      {reconnecting && <ReconnectBanner>재연결 중...</ReconnectBanner>}
      <Layout>
        <IconRail>
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
        </IconRail>
        {mode === "projects" && (
          <>
            <ProjectSidebarList data={tasksData} />
            <ProjectDetailView
              data={tasksData}
              onOpenChannel={(channelId) => {
                setActiveChannelId(channelId);
                setMode("chat");
              }}
            />
          </>
        )}
        {mode === "contests" && <ContestsView data={contestsData} />}
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
              </ChannelItem>
            ))}

          <SectionHeader>
            <SectionTitle type="button" onClick={toggleDmsCollapsed}>
              <Chevron data-collapsed={dmsCollapsed || undefined}>
                <span className="material-symbols-outlined">expand_more</span>
              </Chevron>
              직접 메시지
            </SectionTitle>
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
              </>
            ) : (
              <ChannelHeaderTitle>채널을 선택하거나 새로 만들어 보세요</ChannelHeaderTitle>
            )}
          </ChannelHeader>
          <MessageList ref={messageListRef}>
            {messageGroups.map((g, gi) => (
              <MessageGroupBlock key={gi}>
                {g.authorAvatarUrl ? (
                  <Avatar src={g.authorAvatarUrl} alt="" />
                ) : (
                  <AvatarFallback style={{ background: avatarColor(g.authorId) }}>
                    {(g.authorName ?? "?").charAt(0)}
                  </AvatarFallback>
                )}
                <MessageBody>
                  <MessageMeta>
                    <MessageAuthor>{g.authorName ?? "알 수 없음"}</MessageAuthor>
                    <MessageTime>{formatTime(g.messages[0].createdOn)}</MessageTime>
                  </MessageMeta>
                  {g.messages.map((m, mi) => (
                    <GroupedMessageRow
                      key={m.id}
                      data-mentions-me={
                        (currentUserId && messageContainsMentionOf(m.text, currentUserId)) ||
                        undefined
                      }
                    >
                      {mi > 0 && <GroupedTimestamp>{formatTime(m.createdOn)}</GroupedTimestamp>}
                      <MessageText>{renderMessageText(m.text, knownUserIds)}</MessageText>
                      {/* the point of having chat and projects in one place:
                          something decided in conversation becomes work without
                          being retyped somewhere else */}
                      <RaiseTaskButton
                        type="button"
                        onClick={() => raiseTaskFromMessage(m)}
                        aria-label="이 메시지로 태스크 만들기"
                        title="이 메시지로 태스크 만들기"
                      >
                        <span className="material-symbols-outlined">add_task</span>
                      </RaiseTaskButton>
                    </GroupedMessageRow>
                  ))}
                </MessageBody>
              </MessageGroupBlock>
            ))}
          </MessageList>
          <Composer>
            <MentionInput
              value={draft}
              onChange={setDraft}
              onSend={handleSend}
              users={mentionUsers}
            />
            <button onClick={handleSend}>보내기</button>
          </Composer>
          {sendError && <SendErrorText>{sendError}</SendErrorText>}
        </Main>
          </>
        )}
      </Layout>
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
  const { overlayRef, cardRef } = useModalEnterAnimation();
  useCloseOnEscape(props.onClose);

  return (
        <ModalOverlay ref={overlayRef} onClick={props.onClose}>
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
            if (e.key === "Enter") {
              e.preventDefault();
              props.addTag();
            }
          }}
          placeholder="태그 입력 후 Enter"
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
  color: #767676;
  font-size: 13px;
`;

const ErrorBanner = styled.div`
  text-align: center;
  color: #ff6767;
  padding: 40px;
`;

const ReconnectBanner = styled.div`
  text-align: center;
  color: #9a9a9a;
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
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const IconRail = styled.nav`
  width: 56px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 0;
  background: rgba(24, 24, 24, 0.45);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
`;

const RailButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #9a9a9a;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 22px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #d4d4d4;
  }

  &:focus-visible {
    outline: 2px solid #00b5ff;
    outline-offset: -2px;
  }

  &[data-active] {
    background: rgba(0, 181, 255, 0.15);
    color: #00b5ff;
  }
`;

const Sidebar = styled.div`
  width: 220px;
  background: rgba(37, 37, 37, 0.35);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  padding: 12px;
  overflow-y: auto;
`;

const ChannelItem = styled.div`
  padding: 8px 12px;
  border-radius: 8px;
  color: #d4d4d4;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  &:focus-visible {
    outline: 2px solid #00b5ff;
    outline-offset: -2px;
  }

  &[data-active] {
    background: rgba(0, 181, 255, 0.15);
    color: #00b5ff;
  }
`;

const PresenceDot = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  background: #767676;

  &[data-online] {
    background: #4ade80;
    box-shadow: 0 0 4px rgba(74, 222, 128, 0.6);
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
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: transparent;
  color: #9a9a9a;
  font-size: 11px;
  cursor: pointer;

  &:hover {
    border-color: #00b5ff;
    color: #00b5ff;
  }

  &[data-active] {
    background: rgba(0, 181, 255, 0.2);
    border-color: #00b5ff;
    color: #00b5ff;
  }
`;

const Main = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(37, 37, 37, 0.35);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
`;

const ChannelHeader = styled.div`
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
`;

const ChannelHeaderTitle = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: #fff;
`;

const ChannelHeaderDescription = styled.div`
  margin-top: 2px;
  font-size: 12px;
  color: #9a9a9a;
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
  color: #061018;
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
  color: #00b5ff;
`;

const MessageTime = styled.span`
  font-size: 11px;
  color: #767676;
`;

const MessageText = styled.div`
  color: #e4e4e4;
  font-size: 14px;
`;

const Mention = styled.span`
  color: #00b5ff;
  font-weight: 700;
`;

const GroupedMessageRow = styled.div`
  position: relative;

  &[data-mentions-me] {
    background: rgba(0, 181, 255, 0.08);
  }
`;

const RaiseTaskButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  margin-left: auto;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #767676;
  cursor: pointer;
  opacity: 0;

  .material-symbols-outlined {
    font-size: 17px;
  }

  /* hidden until the row is engaged so a conversation does not read as a
     column of buttons, but reachable by keyboard, which never hovers */
  ${GroupedMessageRow}:hover &,
  &:focus-visible {
    opacity: 1;
  }

  &:hover {
    background: rgba(0, 181, 255, 0.12);
    color: #00b5ff;
  }
`;

const GroupedTimestamp = styled.span`
  position: absolute;
  left: -46px;
  top: 1px;
  font-size: 10px;
  color: #767676;
  opacity: 0;
  transition: opacity 0.1s ease;

  ${GroupedMessageRow}:hover & {
    opacity: 1;
  }
`;

const Composer = styled.div`
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.14);

  input {
    flex: 1;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    outline: none;
  }

  button {
    padding: 10px 18px;
    border-radius: 10px;
    border: none;
    background: #00b5ff;
    color: #061018;
    font-weight: 700;
    cursor: pointer;
  }
`;

const SendErrorText = styled.p`
  padding: 0 12px 12px;
  color: #ff6767;
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
  color: #9a9a9a;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 0;

  &:hover {
    color: #d4d4d4;
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
  color: #9a9a9a;
  border-radius: 6px;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover {
    color: #00b5ff;
    background: rgba(255, 255, 255, 0.06);
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
  background: rgba(37, 37, 37, 0.95);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const ChannelMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  padding: 7px 8px;
  border: none;
  background: transparent;
  color: #d4d4d4;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;

  > .material-symbols-outlined {
    font-size: 17px;
    color: #767676;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #00b5ff;
  }

  &:hover > .material-symbols-outlined {
    color: #00b5ff;
  }

  &[data-active] {
    color: #00b5ff;
  }
`;

const ActiveCheck = styled.span`
  margin-left: auto;
  color: #00b5ff !important;
`;

const ChannelMenuDivider = styled.div`
  height: 1px;
  margin: 4px 0;
  background: rgba(255, 255, 255, 0.14);
`;





const RadioRow = styled.div`
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: #d4d4d4;

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
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 14px;
  color: #d4d4d4;

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
  color: #d4d4d4;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
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
  border: 1px solid rgba(255, 255, 255, 0.28);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease;

  &::after {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: #061018;
    opacity: 0;
    transform: scale(0.6);
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  ${HiddenInput}:checked + & {
    background: #00b5ff;
    border-color: #00b5ff;
  }

  ${HiddenInput}:checked + &::after {
    opacity: 1;
    transform: scale(1);
  }

  ${HiddenInput}:focus-visible + & {
    outline: 2px solid #00b5ff;
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
  background: rgba(0, 181, 255, 0.15);
  color: #00b5ff;
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

