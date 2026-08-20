"use client";

import { useState } from "react";
import styled from "@emotion/styled";
import CustomSelect from "./CustomSelect";
import { ErrorText } from "./modal-styles";
import {
  ROLE_LABELS,
  type OverviewData,
  type OverviewMember,
  type OverviewRole,
} from "@/lib/use-overview-data";

const ROLE_OPTIONS = (["member", "lead", "professor"] as const).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

/** Time of day only — the row already says which day it is about. */
function clock(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function sinceLabel(iso: string | null) {
  if (!iso) return "기록 없음";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

/**
 * The lab, for whoever is answerable for it.
 *
 * Two tabs because two different questions are being asked. "How is the week
 * going" wants one row per person and no detail; "what happened just now"
 * wants the opposite. Both on one screen made each harder to read.
 *
 * What it deliberately does not show is who has a tab open right now. The
 * activity list is built from changes people made, which is a record they
 * created deliberately — presence would be a record made about them.
 */
export default function OverviewView({
  data,
  onOpenTask,
}: {
  data: OverviewData;
  onOpenTask: (projectId: string, taskId: string) => void;
}) {
  const [tab, setTab] = useState<"week" | "activity">("week");

  const byId = new Map(data.members.map((m) => [m.id, m] as const));
  const presentToday = data.members.filter((m) => m.todayInAt).length;

  return (
    <Main>
      <Header>
        <Title>연구실 현황</Title>
        <Sub>
          오늘 {presentToday}/{data.members.length}명
        </Sub>
        <Tabs>
          <TabButton
            type="button"
            data-active={tab === "week" || undefined}
            onClick={() => setTab("week")}
          >
            주간 요약
          </TabButton>
          <TabButton
            type="button"
            data-active={tab === "activity" || undefined}
            onClick={() => setTab("activity")}
          >
            최근 활동
          </TabButton>
        </Tabs>
      </Header>

      {data.loadError && <ErrorText>{data.loadError}</ErrorText>}

      {tab === "week" && (
        <Table>
          <HeadRow>
            <span>구성원</span>
            <span>오늘</span>
            <span>이번 주</span>
            <span>진행 중</span>
            <span>완료</span>
            <span>기한 초과</span>
            <span>{data.canManageRoles ? "역할" : ""}</span>
          </HeadRow>
          {data.members.map((m) => (
            <MemberRow key={m.id} member={m} data={data} />
          ))}
        </Table>
      )}

      {tab === "activity" && (
        <ActivityList>
          {data.activity.length === 0 && <Empty>아직 기록된 변경이 없습니다</Empty>}
          {data.activity.map((a, i) => {
            const openable = Boolean(a.taskId && a.projectId);
            return (
              <ActivityRow
                key={`${a.taskId}-${a.createdAt}-${i}`}
                role={openable ? "button" : undefined}
                tabIndex={openable ? 0 : undefined}
                onClick={() => {
                  if (a.projectId && a.taskId) onOpenTask(a.projectId, a.taskId);
                }}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && a.projectId && a.taskId) {
                    e.preventDefault();
                    onOpenTask(a.projectId, a.taskId);
                  }
                }}
              >
                <ActorName>{byId.get(a.actorId ?? "")?.name ?? "알 수 없는 사용자"}</ActorName>
                <ActivityTask>{a.taskTitle ?? "삭제된 태스크"}</ActivityTask>
                {a.projectName && <ProjectTag>{a.projectName}</ProjectTag>}
                <ActivityWhen>{sinceLabel(a.createdAt)}</ActivityWhen>
              </ActivityRow>
            );
          })}
        </ActivityList>
      )}
    </Main>
  );
}

function MemberRow({ member, data }: { member: OverviewMember; data: OverviewData }) {
  return (
    <Row>
      <NameCell>
        <MemberName>{member.name}</MemberName>
        {!data.canManageRoles && <RoleTag>{ROLE_LABELS[member.role]}</RoleTag>}
      </NameCell>
      <Cell>
        {member.todayInAt ? (
          <TodayIn>{clock(member.todayInAt)}</TodayIn>
        ) : (
          <Faint>{sinceLabel(member.lastSeenAt)}</Faint>
        )}
      </Cell>
      <Cell>{member.daysPresent}일</Cell>
      <Cell>{member.inProgress || <Faint>0</Faint>}</Cell>
      <Cell>{member.done || <Faint>0</Faint>}</Cell>
      <Cell>{member.overdue > 0 ? <Overdue>{member.overdue}</Overdue> : <Faint>0</Faint>}</Cell>
      <Cell>
        {data.canManageRoles && (
          <CustomSelect
            value={member.role}
            onChange={(v) => data.setRole(member.id, v as OverviewRole)}
            options={ROLE_OPTIONS}
          />
        )}
      </Cell>
    </Row>
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

const Tabs = styled.div`
  display: flex;
  gap: 2px;
  margin-left: auto;
  padding: 2px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
`;

const TabButton = styled.button`
  padding: 4px 12px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;

  &:hover {
    color: var(--text);
  }

  &[data-active] {
    background: var(--surface-active);
    color: var(--text-strong);
  }
`;

const Table = styled.div`
  display: flex;
  flex-direction: column;
`;

const ROW_COLUMNS = "minmax(140px, 1.4fr) 84px 70px 70px 70px 84px minmax(0, 132px)";

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
`;

const TodayIn = styled.span`
  color: var(--ok);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
`;

const Faint = styled.span`
  color: var(--text-faint);
`;

const Overdue = styled.span`
  color: var(--danger);
  font-weight: 700;
`;

const ActivityList = styled.div`
  display: flex;
  flex-direction: column;
`;

const ActivityRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--border-faint);
  font-size: 13px;
  color: var(--text);

  &[role="button"] {
    cursor: pointer;
  }

  &[role="button"]:hover {
    background: var(--surface-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
`;

const ActorName = styled.span`
  flex-shrink: 0;
  font-weight: 600;
`;

const ActivityTask = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
`;

const ProjectTag = styled.span`
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--surface-hover);
  color: var(--text-muted);
  font-size: 11px;
`;

const ActivityWhen = styled.span`
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-faint);
  font-size: 12px;
`;

const Empty = styled.p`
  margin: auto;
  padding: 40px 0;
  color: var(--text-faint);
  font-size: 13px;
`;
