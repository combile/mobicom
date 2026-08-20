"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import CalendarView from "./CalendarView";
import CustomSelect from "./CustomSelect";
import DatePicker from "./DatePicker";
import type { ScheduleData, ScheduleItem } from "@/lib/use-schedule-data";
import { useCloseOnEscape, useModalEnterAnimation } from "@/lib/use-modal-enter-animation";
import { todayISO } from "@/lib/use-tasks-data";
import {
  ErrorText,
  Field,
  ModalActions,
  ModalCard,
  ModalOverlay,
  ModalTitle,
} from "./modal-styles";

/**
 * Deadlines from every project in one place.
 *
 * Editing still happens where the item lives — selecting a row hands the
 * project back to the caller. Creating is the exception: picking a day and
 * naming the thing is the whole action, and routing it through "open the
 * project first" loses the date that was just chosen.
 */
export default function ScheduleView({
  data,
  onOpenProject,
}: {
  data: ScheduleData;
  onOpenProject: (projectId: string) => void;
}) {
  // Two ways of asking about the same dates: what is next, and how the month is
  // shaped. Neither replaces the other, so the view keeps both.
  const [mode, setMode] = useState<"list" | "calendar">("calendar");

  /**
   * Tasks and milestones live in a project, so selecting one goes there.
   * A contest has no project — its useful destination is the posting itself,
   * opened in a new tab so the workspace is not navigated away from.
   */
  function activate(item: ScheduleItem) {
    if (item.projectId) {
      onOpenProject(item.projectId);
    } else if (item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <Main>
      <Header>
        <Title>일정</Title>
        {data.overdueCount > 0 && <OverdueTag>기한 초과 {data.overdueCount}건</OverdueTag>}
        <ModeSwitch>
          <ModeButton
            type="button"
            data-active={mode === "calendar" || undefined}
            onClick={() => setMode("calendar")}
            aria-pressed={mode === "calendar"}
          >
            캘린더
          </ModeButton>
          <ModeButton
            type="button"
            data-active={mode === "list" || undefined}
            onClick={() => setMode("list")}
            aria-pressed={mode === "list"}
          >
            목록
          </ModeButton>
        </ModeSwitch>
        <AddScheduleButton type="button" onClick={() => data.openCreate(todayISO())}>
          <span className="material-symbols-outlined">add</span>
          일정 추가
        </AddScheduleButton>
        <DoneToggle
          type="button"
          data-active={data.showDone || undefined}
          onClick={() => data.setShowDone(!data.showDone)}
          aria-pressed={data.showDone}
        >
          완료 포함
        </DoneToggle>
      </Header>

      {mode === "calendar" && !data.loadError && (
        <CalendarView
          items={data.showDone ? data.items : data.items.filter((i) => i.status !== "done")}
          onOpen={(item) => {
            if (item.projectId) onOpenProject(item.projectId);
            else if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
          }}
          onCreate={data.openCreate}
          onReschedule={data.reschedule}
        />
      )}

      {data.createDate && <CreateScheduleModal data={data} />}

      {data.loadError && <ErrorText>{data.loadError}</ErrorText>}

      {mode === "list" && !data.loadError && data.isEmpty && !data.loading && (
        <Empty>
          <EmptyTitle>기한이 정해진 일이 없습니다</EmptyTitle>
          <EmptyHint>&lsquo;일정 추가&rsquo;로 바로 만들거나, 태스크에 날짜를 넣으면 여기 모입니다</EmptyHint>
        </Empty>
      )}

      {/* items exist but every one is filtered out — say that rather than
          repeating the "nothing scheduled" message */}
      {mode === "list" && !data.loadError && !data.isEmpty && data.buckets.length === 0 && (
        <Empty>
          <EmptyTitle>남은 일정이 없습니다</EmptyTitle>
          <EmptyHint>완료된 항목은 &lsquo;완료 포함&rsquo;으로 볼 수 있습니다</EmptyHint>
        </Empty>
      )}

      {mode === "list" && data.buckets.map((bucket) => (
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
              onClick={() => activate(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  activate(item);
                }
              }}
              title={
                item.projectId ? `${item.projectName} 열기` : "대회 공고 열기"
              }
            >
              <KindMark data-kind={item.kind}>
                <span className="material-symbols-outlined">
                  {item.kind === "milestone"
                    ? "flag"
                    : item.kind === "contest"
                      ? "emoji_events"
                      : "check_circle"}
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

/**
 * Create a task or milestone on a chosen day.
 *
 * A milestone needs its date and a task treats it as a deadline, so the same
 * field means different things to the two endpoints — the kind switch is what
 * decides which one gets called, not two separate forms.
 */
function CreateScheduleModal({ data }: { data: ScheduleData }) {
  const { overlayRef, cardRef } = useModalEnterAnimation();
  useCloseOnEscape(data.closeCreate);

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={data.closeCreate}>
      <ModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <ModalTitle>일정 추가</ModalTitle>
        <Field>
          <label htmlFor="schedule-new-title">제목</label>
          <input
            id="schedule-new-title"
            value={data.newTitle}
            onChange={(e) => data.setNewTitle(e.target.value)}
          />
        </Field>
        <Field>
          <label>종류</label>
          <CustomSelect
            fullWidth
            value={data.newKind}
            onChange={(v) => data.setNewKind(v as "task" | "milestone")}
            options={[
              { value: "task", label: "태스크" },
              { value: "milestone", label: "마일스톤" },
            ]}
          />
        </Field>
        <Field>
          <label>프로젝트</label>
          <CustomSelect
            fullWidth
            value={data.newProjectId}
            onChange={data.setNewProjectId}
            options={[
              { value: "", label: "선택하세요" },
              ...data.projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Field>
        <Field>
          <label>{data.newKind === "task" ? "마감일" : "목표 날짜"}</label>
          <DatePicker
            block
            value={data.createDate ?? ""}
            /* an item on the schedule has to sit on a day, so clearing is a
               no-op here rather than a state the form can be submitted in */
            onChange={(v) => v && data.setCreateDate(v)}
          />
        </Field>
        {data.createError && <ErrorText>{data.createError}</ErrorText>}
        <ModalActions>
          <button type="button" onClick={data.closeCreate}>
            취소
          </button>
          <button
            type="button"
            onClick={data.handleCreate}
            disabled={data.creating || !data.newTitle.trim() || !data.newProjectId}
          >
            {data.creating ? "만드는 중..." : "만들기"}
          </button>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>,
    document.body,
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

const OverdueTag = styled.span`
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 11px;
  font-weight: 700;
`;

const ModeSwitch = styled.div`
  display: flex;
  gap: 2px;
  margin-left: auto;
  padding: 2px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
`;

const ModeButton = styled.button`
  padding: 4px 12px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: var(--text);
  }

  &[data-active] {
    background: var(--surface-active);
    color: var(--text-strong);
  }
`;

const AddScheduleButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px 6px 9px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover {
    border-color: var(--border-strong);
    background: var(--surface-hover);
  }
`;

const DoneToggle = styled.button`
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: var(--text);
  }

  &[data-active] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
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
  color: var(--text);

  &[data-tone="overdue"] {
    color: var(--danger);
  }

  &[data-tone="today"] {
    color: var(--warn);
  }

  &[data-tone="done"] {
    color: var(--text-faint);
  }
`;

const BucketCount = styled.span`
  font-size: 11px;
  font-weight: 400;
  color: var(--text-faint);
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  border: 1px solid var(--border);
  cursor: pointer;

  &:hover {
    background: var(--surface-hover);
    border-color: var(--border-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
`;

const KindMark = styled.span`
  display: inline-flex;
  align-items: center;
  color: var(--text-faint);

  .material-symbols-outlined {
    font-size: 16px;
  }

  &[data-kind="milestone"] {
    color: var(--milestone);
  }

  &[data-kind="contest"] {
    color: var(--warn);
  }
`;

const RowTitle = styled.span`
  color: var(--text);
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &[data-done] {
    color: var(--text-faint);
    text-decoration: line-through;
  }
`;

const ProjectTag = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
`;

const Meta = styled.span`
  color: var(--text-faint);
  font-size: 12px;
  white-space: nowrap;
`;

const DateText = styled.span`
  margin-left: auto;
  color: var(--text-faint);
  font-size: 12px;
  white-space: nowrap;

  &[data-tone="overdue"] {
    color: var(--danger);
    font-weight: 600;
  }

  &[data-tone="today"] {
    color: var(--warn);
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
  color: var(--text);
  font-size: 14px;
`;

const EmptyHint = styled.span`
  color: var(--text-faint);
  font-size: 12px;
`;
