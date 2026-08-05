"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";

type Channel = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  kind: "channel" | "dm";
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

export default function MobiOnContent() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);
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

  const visibleChannels = useMemo(
    () =>
      sortedChannels.filter((c) => activeTagFilters.every((t) => c.tags.includes(t))),
    [sortedChannels, activeTagFilters],
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

  const messageListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = messageListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeChannelId]);

  if (connectionError) {
    return (
      <Root>
        <ErrorBanner>{connectionError}</ErrorBanner>
      </Root>
    );
  }

  const activeMessages = messages
    .filter((m) => m.channelId === activeChannelId)
    .sort((a, b) => a.createdOn - b.createdOn);

  return (
    <Root>
      {reconnecting && <ReconnectBanner>재연결 중...</ReconnectBanner>}
      <Layout>
        <Sidebar>
          <SectionHeader ref={channelMenuRef}>
            <SectionTitle type="button" onClick={toggleChannelsCollapsed}>
              <Chevron data-collapsed={channelsCollapsed || undefined}>▾</Chevron>
              채널
            </SectionTitle>
            <SectionActions>
              <IconButton
                type="button"
                onClick={() => setShowChannelMenu((v) => !v)}
                aria-label="채널 메뉴"
              >
                ⋮
              </IconButton>
              <IconButton type="button" onClick={openCreateChannel} aria-label="채널 추가">
                +
              </IconButton>
            </SectionActions>
            {showChannelMenu && (
              <ChannelMenu>
                <ChannelMenuItem
                  type="button"
                  onClick={() => {
                    setSortMode("name");
                    setShowChannelMenu(false);
                  }}
                >
                  {sortMode === "name" ? "✓ " : ""}이름순
                </ChannelMenuItem>
                <ChannelMenuItem
                  type="button"
                  onClick={() => {
                    setSortMode("recent");
                    setShowChannelMenu(false);
                  }}
                >
                  {sortMode === "recent" ? "✓ " : ""}최근 활동순
                </ChannelMenuItem>
                <ChannelMenuDivider />
                <ChannelMenuItem
                  type="button"
                  onClick={() => {
                    setRefreshToken((n) => n + 1);
                    setShowChannelMenu(false);
                  }}
                >
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
            visibleChannels.map((c) => (
              <ChannelItem
                key={c.id}
                data-active={c.id === activeChannelId || undefined}
                onClick={() => setActiveChannelId(c.id)}
              >
                {c.kind === "dm" ? "@" : "#"} {c.name}
              </ChannelItem>
            ))}
        </Sidebar>
        <Main>
          <MessageList ref={messageListRef}>
            {activeMessages.map((m) => (
              <MessageRow key={m.id}>
                {m.authorAvatarUrl ? (
                  <Avatar src={m.authorAvatarUrl} alt="" />
                ) : (
                  <AvatarFallback style={{ background: avatarColor(m.authorId) }}>
                    {(m.authorName ?? "?").charAt(0)}
                  </AvatarFallback>
                )}
                <MessageBody>
                  <MessageMeta>
                    <MessageAuthor>{m.authorName ?? "알 수 없음"}</MessageAuthor>
                    <MessageTime>{formatTime(m.createdOn)}</MessageTime>
                  </MessageMeta>
                  <MessageText>{m.text}</MessageText>
                </MessageBody>
              </MessageRow>
            ))}
          </MessageList>
          <Composer>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="메시지 입력..."
            />
            <button onClick={handleSend}>보내기</button>
          </Composer>
          {sendError && <SendErrorText>{sendError}</SendErrorText>}
        </Main>
      </Layout>
      {showCreateChannel && (
        <ModalOverlay onClick={() => setShowCreateChannel(false)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 채널 만들기</ModalTitle>
            <Field>
              <label htmlFor="new-channel-name">채널 이름</label>
              <input
                id="new-channel-name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
            </Field>
            <Field>
              <label htmlFor="new-channel-description">설명</label>
              <input
                id="new-channel-description"
                value={newChannelDescription}
                onChange={(e) => setNewChannelDescription(e.target.value)}
                placeholder="채널 설명 (선택)"
              />
            </Field>
            <Field>
              <label htmlFor="new-channel-tags">태그</label>
              <input
                id="new-channel-tags"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="태그 입력 후 Enter"
              />
              {newChannelTags.length > 0 && (
                <TagChipRow>
                  {newChannelTags.map((tag) => (
                    <TagChip key={tag}>
                      {tag}
                      <TagChipRemove type="button" onClick={() => removeTag(tag)}>
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
                  checked={!newChannelPrivate}
                  onChange={() => setNewChannelPrivate(false)}
                />
                <RadioBox />
                공개
              </CheckRow>
              <CheckRow>
                <HiddenInput
                  type="radio"
                  checked={newChannelPrivate}
                  onChange={() => setNewChannelPrivate(true)}
                />
                <RadioBox />
                비공개
              </CheckRow>
            </RadioRow>
            {newChannelPrivate && (
              <>
                <MemberList>
                  {allUsers.map((u) => (
                    <CheckRow key={u.id}>
                      <HiddenInput
                        type="checkbox"
                        checked={newChannelMemberIds.includes(u.id)}
                        onChange={() => toggleMember(u.id)}
                      />
                      <CheckboxBox />
                      {u.name}
                    </CheckRow>
                  ))}
                </MemberList>
                <CheckRow>
                  <HiddenInput
                    type="checkbox"
                    checked={newChannelProfessor}
                    onChange={(e) => setNewChannelProfessor(e.target.checked)}
                  />
                  <CheckboxBox />
                  교수님에게 공개
                </CheckRow>
              </>
            )}
            {createChannelError && <SendErrorText>{createChannelError}</SendErrorText>}
            <ModalActions>
              <button type="button" onClick={() => setShowCreateChannel(false)}>
                취소
              </button>
              <button type="button" onClick={handleCreateChannel} disabled={creatingChannel}>
                {creatingChannel ? "만드는 중..." : "만들기"}
              </button>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
  /* Header.tsx's Bar is position: absolute, top: 54px, height: 75px — its
     bottom edge sits at 129px. Match the top padding About/Members/Blog
     already use so the fixed header never overlaps page content. */
  padding: clamp(135px, 14.4vh, 189px) 24px 24px;
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
  height: calc(100vh - clamp(159px, 17.4vh, 213px));
  max-width: 1100px;
  margin: 0 auto;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
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

  &[data-active] {
    background: rgba(0, 181, 255, 0.15);
    color: #00b5ff;
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

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MessageRow = styled.div`
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
  display: inline-block;
  transition: transform 0.15s ease;

  &[data-collapsed] {
    transform: rotate(-90deg);
  }
`;

const SectionActions = styled.div`
  display: flex;
  gap: 4px;
`;

const IconButton = styled.button`
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #9a9a9a;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;

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
  min-width: 140px;
  padding: 6px;
  border-radius: 10px;
  background: rgba(37, 37, 37, 0.95);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const ChannelMenuItem = styled.button`
  text-align: left;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: #d4d4d4;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #00b5ff;
  }
`;

const ChannelMenuDivider = styled.div`
  height: 1px;
  margin: 4px 0;
  background: rgba(255, 255, 255, 0.14);
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
`;

const ModalCard = styled.div`
  width: min(360px, calc(100% - 48px));
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px;
  border-radius: 16px;
  background: rgba(37, 37, 37, 0.95);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: #fff;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 13px;
    color: #9a9a9a;
  }

  input {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    font-size: 14px;
    outline: none;
  }
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

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  button {
    padding: 8px 16px;
    border-radius: 10px;
    border: none;
    font-size: 14px;
    cursor: pointer;
  }

  button:first-of-type {
    background: transparent;
    color: #9a9a9a;
  }

  button:last-of-type {
    background: #00b5ff;
    color: #061018;
    font-weight: 700;

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }
`;
