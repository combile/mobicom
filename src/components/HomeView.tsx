"use client";

import styled from "@emotion/styled";
import type { HomeData, HomeTask } from "@/lib/use-home-data";
import { ErrorText } from "./modal-styles";

/**
 * The landing screen: what needs this person today, pulled from every project.
 *
 * Everything here points somewhere rather than being a place to work —
 * selecting a row opens it where it lives, so there is no second copy of the
 * editing UI to keep in step.
 */
export default function HomeView({
  data,
  onOpenTask,
}: {
  data: HomeData;
  onOpenTask: (projectId: string, taskId: string) => void;
}) {
  return (
    <Main>
      <Header>
        <Greeting>{data.userName ? `${data.userName}님, 오늘 할 일입니다` : "오늘 할 일"}</Greeting>
        <Counts>
          {data.overdue.length > 0 && (
            <Count data-tone="overdue">기한 초과 {data.overdue.length}</Count>
          )}
          {data.dueToday.length > 0 && <Count data-tone="today">오늘 {data.dueToday.length}</Count>}
          <Count>내 태스크 {data.myTasks.length}</Count>
        </Counts>
      </Header>

      {data.loadError && <ErrorText>{data.loadError}</ErrorText>}

      {!data.loadError && data.isClear && !data.loading && (
        <Clear>
          <ClearTitle>지금 맡은 일이 없습니다</ClearTitle>
          <ClearHint>
            프로젝트에서 태스크를 맡거나, 대화 중 나온 할 일을 태스크로 올려 보세요
          </ClearHint>
        </Clear>
      )}

      {/* notifications lead: a deadline is known in advance and can be planned
          around, but someone waiting on you is not */}
      {data.notifications.length > 0 && (
        <Section>
          <SectionTitle>
            알림
            {data.unreadCount > 0 && <UnreadDot>{data.unreadCount}</UnreadDot>}
            {data.unreadCount > 0 && (
              <MarkAll type="button" onClick={data.markAllRead}>
                모두 읽음
              </MarkAll>
            )}
          </SectionTitle>
          {data.notifications.map((n) => (
            <NotificationRow
              key={n.id}
              role="button"
              tabIndex={0}
              data-read={n.read || undefined}
              onClick={() => {
                data.markRead(n.id);
                if (n.projectId && n.taskId) onOpenTask(n.projectId, n.taskId);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  data.markRead(n.id);
                  if (n.projectId && n.taskId) onOpenTask(n.projectId, n.taskId);
                }
              }}
            >
              <NotifTop>
                <NotifKind data-kind={n.kind}>
                  {n.kind === "assigned" ? "배정" : "답글"}
                </NotifKind>
                <NotifActor>{n.actorName ?? "알 수 없는 사용자"}</NotifActor>
                {n.taskTitle && <NotifTask>{n.taskTitle}</NotifTask>}
              </NotifTop>
              <NotifBody>{n.body}</NotifBody>
            </NotificationRow>
          ))}
        </Section>
      )}

      <TaskBucket
        title="기한이 지났습니다"
        tone="overdue"
        tasks={data.overdue}
        onOpen={onOpenTask}
      />
      <TaskBucket title="오늘까지" tone="today" tasks={data.dueToday} onOpen={onOpenTask} />
      <TaskBucket title="나머지" tasks={data.rest} onOpen={onOpenTask} />

      {data.contests.length > 0 && (
        <Section>
          <SectionTitle>관심 대회 마감</SectionTitle>
          {data.contests.map((c) => (
            <ContestRow key={c.id} href={c.url} target="_blank" rel="noopener noreferrer">
              <span>{c.title}</span>
              <ContestDate>{c.deadline}</ContestDate>
            </ContestRow>
          ))}
        </Section>
      )}
    </Main>
  );
}

function TaskBucket({
  title,
  tone,
  tasks,
  onOpen,
}: {
  title: string;
  tone?: string;
  tasks: HomeTask[];
  onOpen: (projectId: string, taskId: string) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <Section>
      <SectionTitle data-tone={tone}>
        {title}
        <SectionCount>{tasks.length}</SectionCount>
      </SectionTitle>
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(t.projectId, t.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(t.projectId, t.id);
            }
          }}
        >
          <TaskTitle>{t.title}</TaskTitle>
          <ProjectTag>{t.projectName}</ProjectTag>
          {t.status === "in_progress" && <StatusTag>진행중</StatusTag>}
          <Due data-tone={tone}>{t.dueDate ?? "기한 없음"}</Due>
        </TaskRow>
      ))}
    </Section>
  );
}

const Main = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: rgba(37, 37, 37, 0.35);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  overflow-y: auto;
  padding: 20px;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const Greeting = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: #fff;
`;

const Counts = styled.div`
  display: flex;
  gap: 6px;
  margin-left: auto;
`;

const Count = styled.span`
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #9a9a9a;
  font-size: 11px;
  font-weight: 700;

  &[data-tone="overdue"] {
    background: rgba(255, 103, 103, 0.16);
    color: #ff6767;
  }

  &[data-tone="today"] {
    background: rgba(255, 157, 92, 0.16);
    color: #ff9d5c;
  }
`;

const Section = styled.section`
  margin-bottom: 18px;
`;

const SectionTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: #d4d4d4;

  &[data-tone="overdue"] {
    color: #ff6767;
  }

  &[data-tone="today"] {
    color: #ff9d5c;
  }
`;

const SectionCount = styled.span`
  font-size: 11px;
  font-weight: 400;
  color: #767676;
`;

const rowBase = `
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.2);
  }

  &:focus-visible {
    outline: 2px solid #00b5ff;
    outline-offset: -2px;
  }
`;

const TaskRow = styled.div`
  ${rowBase}
`;

const TaskTitle = styled.span`
  color: #d4d4d4;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ProjectTag = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #9a9a9a;
  font-size: 11px;
  white-space: nowrap;
`;

const StatusTag = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 181, 255, 0.12);
  color: #00b5ff;
  font-size: 11px;
  white-space: nowrap;
`;

const Due = styled.span`
  margin-left: auto;
  color: #767676;
  font-size: 12px;
  white-space: nowrap;

  &[data-tone="overdue"] {
    color: #ff6767;
    font-weight: 600;
  }

  &[data-tone="today"] {
    color: #ff9d5c;
    font-weight: 600;
  }
`;

const UnreadDot = styled.span`
  padding: 0 7px;
  border-radius: 999px;
  background: #00b5ff;
  color: #061018;
  font-size: 11px;
  font-weight: 700;
`;

const MarkAll = styled.button`
  margin-left: auto;
  border: none;
  background: transparent;
  color: #767676;
  font-size: 11px;
  cursor: pointer;

  &:hover {
    color: #00b5ff;
  }
`;

const NotificationRow = styled.div`
  ${rowBase}
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  /* unread reads as a filled card rather than a marked one; a coloured rule
     down the side competed with the rail and the section headings */
  background: rgba(0, 181, 255, 0.06);
  border-color: rgba(0, 181, 255, 0.22);

  &[data-read] {
    background: transparent;
    border-color: rgba(255, 255, 255, 0.1);
    opacity: 0.55;
  }
`;

const NotifTop = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
`;

const NotifKind = styled.span`
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(0, 181, 255, 0.12);
  color: #00b5ff;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;

  &[data-kind="assigned"] {
    background: rgba(139, 124, 246, 0.16);
    color: #8b7cf6;
  }
`;

const NotifActor = styled.span`
  color: #d4d4d4;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
`;

const NotifTask = styled.span`
  color: #767676;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const NotifBody = styled.p`
  color: #9a9a9a;
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;






const ContestRow = styled.a`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #d4d4d4;
  font-size: 14px;
  text-decoration: none;

  &:hover {
    border-color: rgba(0, 181, 255, 0.4);
    color: #00b5ff;
  }

  &:focus-visible {
    outline: 2px solid #00b5ff;
    outline-offset: -2px;
  }
`;

const ContestDate = styled.span`
  margin-left: auto;
  color: #767676;
  font-size: 12px;
`;

const Clear = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: auto;
  max-width: 460px;
  text-align: center;
`;

const ClearTitle = styled.span`
  color: #d4d4d4;
  font-size: 14px;
`;

const ClearHint = styled.span`
  color: #767676;
  font-size: 12px;
  line-height: 1.6;
`;
