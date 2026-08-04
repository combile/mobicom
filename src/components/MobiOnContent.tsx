"use client";

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";

type Channel = { id: string; name: string; kind: "channel" | "dm" };
type Message = {
  id: string;
  channelId: string;
  text: string;
  authorId: string;
  authorName: string | null;
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

export default function MobiOnContent() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const retryDelay = useRef(1000);

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
  }, []);

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
          {channels.map((c) => (
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
                <MessageMeta>
                  <MessageAuthor>{m.authorName ?? "알 수 없음"}</MessageAuthor>
                  <MessageTime>{formatTime(m.createdOn)}</MessageTime>
                </MessageMeta>
                <MessageText>{m.text}</MessageText>
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
  flex-direction: column;
  gap: 2px;
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
