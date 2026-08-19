"use client";

import styled from "@emotion/styled";
import type { ScheduleData, ScheduleItem } from "@/lib/use-schedule-data";
import { ErrorText } from "./modal-styles";

/**
 * Deadlines from every project in one list.
 *
 * Read-only by design: this is a view over tasks and milestones, not a place
 * that owns anything, so editing happens where the item lives. Selecting a row
 * hands the project back to the caller, which switches to the projects mode.
 */
export default function ScheduleView({
  data,
  onOpenProject,
}: {
  data: ScheduleData;
  onOpenProject: (projectId: string) => void;
}) {
  return (
    <Main>
      <Header>
        <Title>일정</Title>
        {data.overdueCount > 0 && <OverdueTag>기한 초과 {data.overdueCount}건</OverdueTag>}
        <DoneToggle
          type="button"
          data-active={data.showDone || undefined}
          onClick={() => data.setShowDone(!data.showDone)}
          aria-pressed={data.showDone}
        >
          완료 포함
        </DoneToggle>
      </Header>

      {data.loadError && <ErrorText>{data.loadError}</ErrorText>}

      {!data.loadError && data.isEmpty && !data.loading && (
        <Empty>
          <EmptyTitle>기한이 정해진 일이 없습니다</EmptyTitle>
          <EmptyHint>태스크나 마일스톤에 날짜를 넣으면 여기 모여서 보입니다</EmptyHint>
        </Empty>
      )}

      {/* items exist but every one is filtered out — say that rather than
          repeating the "nothing scheduled" message */}
      {!data.loadError && !data.isEmpty && data.buckets.length === 0 && (
        <Empty>
          <EmptyTitle>남은 일정이 없습니다</EmptyTitle>
          <EmptyHint>완료된 항목은 &lsquo;완료 포함&rsquo;으로 볼 수 있습니다</EmptyHint>
        </Empty>
      )}

      {data.buckets.map((bucket) => (
        <Bucket key={bucket.key}>
          <BucketHeading data-tone={bucket.key}>
            {bucket.title}
            <BucketCount>{bucket.items.length}</BucketCount>
          </BucketHeading>
          {bucket.items.map((item) => (
            <Row
              key={`${item.kind}-${item.id}`}
              role="button"
              tabIndex={0}
              onClick={() => onOpenProject(item.projectId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenProject(item.projectId);
                }
              }}
              title={`${item.projectName} 열기`}
            >
              <KindMark data-kind={item.kind}>
                <span className="material-symbols-outlined">
                  {item.kind === "milestone" ? "flag" : "check_circle"}
                </span>
              </KindMark>
              <RowTitle data-done={item.status === "done" || undefined}>{item.title}</RowTitle>
              <ProjectTag>{item.projectName}</ProjectTag>
              {item.assigneeName && <Meta>{item.assigneeName}</Meta>}
              <DateText data-tone={bucket.key}>{formatDate(item)}</DateText>
            </Row>
          ))}
        </Bucket>
      ))}
    </Main>
  );
}

/** Month/day is enough — the bucket heading already says how far off it is. */
function formatDate(item: ScheduleItem) {
  const [, month, day] = item.date.split("-");
  return `${Number(month)}/${Number(day)}`;
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
  gap: 10px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: #fff;
`;

const OverdueTag = styled.span`
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(255, 103, 103, 0.16);
  color: #ff6767;
  font-size: 11px;
  font-weight: 700;
`;

const DoneToggle = styled.button`
  margin-left: auto;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: #9a9a9a;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: #d4d4d4;
  }

  &[data-active] {
    border-color: rgba(0, 181, 255, 0.28);
    background: rgba(0, 181, 255, 0.12);
    color: #00b5ff;
  }
`;

const Bucket = styled.section`
  margin-bottom: 18px;
`;

const BucketHeading = styled.h2`
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

  &[data-tone="done"] {
    color: #767676;
  }
`;

const BucketCount = styled.span`
  font-size: 11px;
  font-weight: 400;
  color: #767676;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
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

const KindMark = styled.span`
  display: inline-flex;
  align-items: center;
  color: #767676;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &[data-kind="milestone"] {
    color: #8b7cf6;
  }
`;

const RowTitle = styled.span`
  color: #d4d4d4;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &[data-done] {
    color: #767676;
    text-decoration: line-through;
  }
`;

const ProjectTag = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #9a9a9a;
  font-size: 11px;
  white-space: nowrap;
`;

const Meta = styled.span`
  color: #767676;
  font-size: 12px;
  white-space: nowrap;
`;

const DateText = styled.span`
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

const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: auto;
  text-align: center;
`;

const EmptyTitle = styled.span`
  color: #d4d4d4;
  font-size: 14px;
`;

const EmptyHint = styled.span`
  color: #767676;
  font-size: 12px;
`;
