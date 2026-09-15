"use client";

import styled from "@emotion/styled";
import { ROLE_LABELS } from "@/lib/use-overview-data";
import type { AttendanceData, AttendanceMember } from "@/lib/use-attendance-data";
import { formatAccumulated } from "@/lib/mobion-attendance";
import { ErrorText } from "./modal-styles";

/** Time of day only — the row already says which day it is about. */
function clock(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function status(m: AttendanceMember): { label: string; tone: "in" | "away" | "out" | "none" } {
  if (!m.checkedInAt) return { label: "출근 전", tone: "none" };
  if (m.leftAt) return { label: "퇴근", tone: "out" };
  if (m.currentlyAway) return { label: "자리 비움", tone: "away" };
  return { label: "근무 중", tone: "in" };
}

/**
 * Everyone's today, for everyone — unlike 연구실 현황 (Overview), which is a
 * week of history and task load for whoever is answerable for the lab. This
 * is the whiteboard-by-the-door version: who is in, since when, and how long
 * they have actually been at it once class/meal breaks are taken out.
 */
export default function AttendanceView({ data }: { data: AttendanceData }) {
  const inNow = data.members.filter((m) => m.checkedInAt && !m.leftAt && !m.currentlyAway).length;

  return (
    <Main>
      <Header>
        <Title>출퇴근</Title>
        <Sub>지금 근무 중 {inNow}명</Sub>
      </Header>

      {data.loadError && <ErrorText>{data.loadError}</ErrorText>}

      <Table>
        <HeadRow>
          <span>구성원</span>
          <span>상태</span>
          <span>출근</span>
          <span>퇴근</span>
          <span>오늘 누적</span>
        </HeadRow>
        {data.members.map((m) => {
          const s = status(m);
          return (
            <Row key={m.id}>
              <NameCell>
                <MemberName>{m.name}</MemberName>
                <RoleTag>{ROLE_LABELS[m.role]}</RoleTag>
              </NameCell>
              <Cell>
                <StatusTag data-tone={s.tone}>{s.label}</StatusTag>
              </Cell>
              <Cell>{clock(m.checkedInAt) ?? <Faint>—</Faint>}</Cell>
              <Cell>{clock(m.leftAt) ?? <Faint>—</Faint>}</Cell>
              <Cell>
                {m.checkedInAt ? formatAccumulated(m.accumulatedSeconds) : <Faint>—</Faint>}
              </Cell>
            </Row>
          );
        })}
      </Table>
    </Main>
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
  align-items: center;
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

const Table = styled.div`
  display: flex;
  flex-direction: column;
`;

const ROW_COLUMNS = "minmax(140px, 1.4fr) 96px 70px 70px 110px";

const HeadRow = styled.div`
  display: grid;
  grid-template-columns: ${ROW_COLUMNS};
  gap: 8px;
  align-items: center;
  padding: 0 10px 8px;
  color: var(--text-faint);
  font-size: 11px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: ${ROW_COLUMNS};
  gap: 8px;
  align-items: center;
  padding: 9px 10px;
  border-top: 1px solid var(--border-faint);
  font-size: 13px;
  color: var(--text);
`;

const NameCell = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

const MemberName = styled.span`
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RoleTag = styled.span`
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--surface-hover);
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
`;

const Cell = styled.span`
  min-width: 0;
  font-variant-numeric: tabular-nums;
`;

const Faint = styled.span`
  color: var(--text-faint);
`;

const StatusTag = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  background: var(--surface-hover);
  color: var(--text-muted);

  &[data-tone="in"] {
    background: var(--ok-soft);
    color: var(--ok);
  }

  &[data-tone="away"] {
    background: var(--warn-soft);
    color: var(--warn);
  }

  &[data-tone="out"] {
    background: var(--surface-hover);
    color: var(--text-faint);
  }
`;
