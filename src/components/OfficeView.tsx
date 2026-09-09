"use client";

import styled from "@emotion/styled";
import { ErrorText } from "./modal-styles";
import type { OfficeData, PresentMember } from "@/lib/use-office-data";

const AVATAR_COLORS = ["var(--accent)", "var(--warn)", "var(--milestone)", "var(--ok)", "var(--danger)"];

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h >>> 0;
}

function avatarColor(id: string) {
  return AVATAR_COLORS[hash(id) % AVATAR_COLORS.length];
}

/** Deterministic 0..1 from a seed — stable across re-renders so the cluster
 *  doesn't jump around on every 15s poll, but different per person. */
function seeded(seed: number) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * A loose, non-overlapping scatter rather than true randomness: each person
 * gets a cell in a grid sized to the headcount, then is jittered within it.
 * A grid alone reads as a spreadsheet; pure random coordinates collide for
 * anything but a handful of people. This keeps the "floating in a room" feel
 * without two avatars landing on top of each other.
 */
function scatterPosition(index: number, count: number, seed: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const cellW = 100 / cols;
  const cellH = 100 / rows;
  const jitterX = (seeded(seed) - 0.5) * cellW * 0.5;
  const jitterY = (seeded(seed + 1) - 0.5) * cellH * 0.5;
  const left = Math.min(88, Math.max(12, col * cellW + cellW / 2 + jitterX));
  const top = Math.min(84, Math.max(16, row * cellH + cellH / 2 + jitterY));
  const delay = seeded(seed + 2) * 3;
  const duration = 3.5 + seeded(seed + 3) * 2;
  return { left, top, delay, duration };
}

/**
 * Who is in the lab right now, drifting in a shared space rather than listed
 * in a row — this is meant to be glanced at, not scanned. Nobody who isn't
 * here appears at all: there is no "last seen 3 hours ago" to soften, since
 * the data behind this view only ever answers "right now".
 */
export default function OfficeView({ data }: { data: OfficeData }) {
  return (
    <Main>
      <Header>
        <Title>오피스</Title>
        <Sub>
          {data.present.length > 0 ? `${data.present.length}명 접속 중` : "아무도 없어요"}
        </Sub>
      </Header>

      {data.loadError && <ErrorText>{data.loadError}</ErrorText>}

      <Room>
        {data.isEmpty && !data.loading && (
          <Empty>
            <span className="material-symbols-outlined">meeting_room</span>
            지금 오피스에 아무도 없어요
          </Empty>
        )}
        {data.present.map((m, i) => (
          <PresentBubble key={m.id} member={m} index={i} count={data.present.length} />
        ))}
      </Room>
    </Main>
  );
}

function PresentBubble({
  member,
  index,
  count,
}: {
  member: PresentMember;
  index: number;
  count: number;
}) {
  const { left, top, delay, duration } = scatterPosition(index, count, hash(member.id));

  return (
    <Bubble
      style={{
        left: `${left}%`,
        top: `${top}%`,
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
      }}
    >
      <AvatarWrap>
        {member.avatarUrl ? (
          <Avatar src={member.avatarUrl} alt="" />
        ) : (
          <AvatarFallback style={{ background: avatarColor(member.id) }}>
            {member.name.charAt(0)}
          </AvatarFallback>
        )}
        <OnlineDot />
      </AvatarWrap>
      <Name>{member.name}</Name>
    </Bubble>
  );
}

const Main = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel-wash);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  overflow-y: auto;
  padding: 20px;
`;

const Header = styled.header`
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: var(--text-strong);
`;

const Sub = styled.span`
  color: var(--text-muted);
  font-size: 12px;
`;

const Room = styled.div`
  position: relative;
  flex: 1;
  min-height: 420px;
  border: 1px solid var(--border-faint);
  border-radius: 16px;
  background: var(--surface);
`;

const Bubble = styled.div`
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: office-float 4s ease-in-out infinite;

  @keyframes office-float {
    0%, 100% { transform: translate(-50%, -50%) translateY(0); }
    50% { transform: translate(-50%, -50%) translateY(-8px); }
  }
`;

const AvatarWrap = styled.div`
  position: relative;
  width: 56px;
  height: 56px;
`;

const Avatar = styled.img`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--surface);
`;

const AvatarFallback = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  color: var(--text-strong);
  font-weight: 700;
  font-size: 18px;
`;

const OnlineDot = styled.span`
  position: absolute;
  top: 2px;
  right: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--ok);
  border: 2px solid var(--surface);
  animation: office-pulse 2s ease-out infinite;

  @keyframes office-pulse {
    0% { box-shadow: 0 0 0 0 var(--ok-soft); }
    100% { box-shadow: 0 0 0 10px transparent; }
  }
`;

const Name = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-raised);
  border: 1px solid var(--border-faint);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
`;

const Empty = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-faint);
  font-size: 13px;

  .material-symbols-outlined {
    font-size: 32px;
  }
`;
