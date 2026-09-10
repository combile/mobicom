"use client";

import { useState } from "react";
import styled from "@emotion/styled";
import CustomSelect from "./CustomSelect";
import {
  NEXT_STATUS,
  TASK_STATUS_OPTIONS,
  dueState,
  type Task,
  type TasksData,
} from "@/lib/use-tasks-data";

const AVATAR_TINTS = ["#3b5bdb", "#2f7a5a", "#8b5cf6", "#b45309", "#0e7490", "#9d174d"];

/** Stable colour per person so the same name keeps the same chip across views. */
function avatarTint(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
}

/**
 * Todo / In progress / Done as three columns, cards moved between them by
 * drag or by the arrow on a card.
 *
 * Deliberately ignores `statusFilter`: status is this view's own axis, so a
 * filter left set from the list tab would otherwise empty out two of the
 * three columns for no reason visible here. Search, milestone and assignee
 * still apply — those narrow *which* tasks show, not which column they land
 * in — which is also why "내 태스크" (my tasks) works here: it is just the
 * assignee filter pinned to the signed-in user, so a task created for someone
 * lands directly in the column of their own board.
 */
export default function TaskBoardView({ data }: { data: TasksData }) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);

  const term = data.search.trim().toLowerCase();
  const filtered = data.tasks.filter(
    (t) =>
      (!data.milestoneFilter || t.milestoneId === data.milestoneFilter) &&
      (!data.assigneeFilter || t.assigneeId === data.assigneeFilter) &&
      (!term ||
        t.title.toLowerCase().includes(term) ||
        (t.description ?? "").toLowerCase().includes(term)),
  );

  function dropOn(status: string, e: React.DragEvent) {
    e.preventDefault();
    setOverStatus(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!taskId) return;
    const task = data.tasks.find((t) => t.id === taskId);
    if (task && task.status !== status) data.updateTaskStatus(taskId, status);
  }

  return (
    <>
      <FilterRow>
        <SearchWrap>
          <span className="material-symbols-outlined">search</span>
          <SearchInput
            type="search"
            value={data.search}
            onChange={(e) => data.setSearch(e.target.value)}
            placeholder="제목·설명 검색"
            aria-label="태스크 검색"
          />
        </SearchWrap>
        <CustomSelect
          value={data.milestoneFilter}
          onChange={data.setMilestoneFilter}
          options={[
            { value: "", label: "모든 마일스톤" },
            ...data.milestones.map((m) => ({ value: m.id, label: m.title })),
          ]}
        />
        <CustomSelect
          value={data.assigneeFilter}
          onChange={data.setAssigneeFilter}
          options={[
            { value: "", label: "모든 담당자" },
            ...data.allUsers.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />
        {data.currentUserId && (
          <GroupToggle
            type="button"
            data-active={data.myTasksActive || undefined}
            onClick={data.toggleMyTasks}
            aria-pressed={data.myTasksActive}
          >
            <span className="material-symbols-outlined">person</span>
            내 태스크
            {data.myOpenCount > 0 && <ToggleCount>{data.myOpenCount}</ToggleCount>}
          </GroupToggle>
        )}
      </FilterRow>

      <Board>
        {TASK_STATUS_OPTIONS.map((col) => {
          const columnTasks = filtered.filter((t) => t.status === col.value);
          return (
            <Column
              key={col.value}
              data-over={overStatus === col.value || undefined}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overStatus !== col.value) setOverStatus(col.value);
              }}
              onDragLeave={(e) => {
                // dragleave fires when the pointer crosses onto a card inside
                // the column too — only clear once it has actually left the
                // column's own box.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setOverStatus(null);
                }
              }}
              onDrop={(e) => dropOn(col.value, e)}
            >
              <ColumnHeader data-status={col.value}>
                {col.label}
                <ColumnCount>{columnTasks.length}</ColumnCount>
              </ColumnHeader>
              <ColumnBody>
                {columnTasks.length === 0 && <ColumnEmpty>없음</ColumnEmpty>}
                {columnTasks.map((t) => (
                  <BoardCard
                    key={t.id}
                    task={t}
                    data={data}
                    dragging={draggingId === t.id}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", t.id);
                      setDraggingId(t.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStatus(null);
                    }}
                  />
                ))}
              </ColumnBody>
            </Column>
          );
        })}
      </Board>
    </>
  );
}

function BoardCard({
  task,
  data,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  data: TasksData;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const next = NEXT_STATUS[task.status];
  const due = dueState(task.dueDate, task.status);

  return (
    <Card
      draggable
      data-dragging={dragging || undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      onClick={() => data.setSelectedTaskId(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          data.setSelectedTaskId(task.id);
        }
      }}
    >
      <CardTitle>{task.title}</CardTitle>
      <CardMetaRow>
        {task.milestoneId && (
          <MilestoneChip>
            {data.milestones.find((m) => m.id === task.milestoneId)?.title ?? "—"}
          </MilestoneChip>
        )}
        {task.checklistTotal > 0 && (
          <ChecklistChip
            data-complete={task.checklistDone === task.checklistTotal || undefined}
            title={`체크리스트 ${task.checklistDone}/${task.checklistTotal} 완료`}
          >
            <span className="material-symbols-outlined">checklist</span>
            {task.checklistDone}/{task.checklistTotal}
          </ChecklistChip>
        )}
        {task.dueDate && <DueChip data-tone={due ?? undefined}>{task.dueDate}</DueChip>}
      </CardMetaRow>
      <CardFooter>
        {task.assigneeName ? (
          <Assignee>
            <AssigneeDot style={{ background: avatarTint(task.assigneeName) }} />
            {task.assigneeName}
          </Assignee>
        ) : (
          <Assignee data-empty>미배정</Assignee>
        )}
        {next && (
          <NextButton
            type="button"
            title={next.hint}
            onClick={(e) => {
              e.stopPropagation();
              data.updateTaskStatus(task.id, next.value);
            }}
          >
            <span className="material-symbols-outlined">arrow_forward</span>
          </NextButton>
        )}
      </CardFooter>
    </Card>
  );
}

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
`;

const SearchWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 160px;
  min-width: 140px;
  max-width: 280px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--surface-sunken);
  color: var(--text-faint);

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
`;

const SearchInput = styled.input`
  width: 100%;
  min-width: 0;
  padding: 7px 0;
  border: none;
  background: transparent;
  color: var(--text-strong);
  font-size: 13px;
  outline: none;

  &::placeholder {
    color: var(--text-faint);
  }
`;

const GroupToggle = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover {
    color: var(--text);
  }

  &[data-active] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }
`;

const ToggleCount = styled.span`
  padding: 0 5px;
  border-radius: 999px;
  background: var(--surface-active);
  font-size: 11px;
  font-weight: 700;
`;

const Board = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: start;

  /* three columns side by side stop being readable well before phone width */
  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: 10px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  transition: border-color 0.12s ease, background 0.12s ease;

  &[data-over] {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
`;

const ColumnHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  border-bottom: 1px solid var(--border);

  &[data-status="done"] {
    color: var(--ok);
  }
`;

const ColumnCount = styled.span`
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-active);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 400;
`;

const ColumnBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  min-height: 120px;
`;

const ColumnEmpty = styled.div`
  padding: 8px 4px;
  color: var(--text-faint);
  font-size: 12px;
  text-align: center;
`;

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--panel);
  cursor: grab;

  &:hover {
    border-color: var(--border-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  &[data-dragging] {
    opacity: 0.5;
  }

  &:active {
    cursor: grabbing;
  }
`;

const CardTitle = styled.div`
  font-size: 13px;
  color: var(--text-strong);
  line-height: 1.4;
`;

const CardMetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const MilestoneChip = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
`;

const ChecklistChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;

  .material-symbols-outlined {
    font-size: 13px;
  }

  &[data-complete] {
    color: var(--ok);
  }
`;

const DueChip = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-faint);
  font-size: 11px;
  white-space: nowrap;

  &[data-tone="overdue"] {
    background: var(--danger-soft);
    color: var(--danger);
  }

  &[data-tone="soon"] {
    background: var(--warn-soft);
    color: var(--warn);
  }
`;

const CardFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
`;

const Assignee = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-muted);
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &[data-empty] {
    color: var(--text-faint);
  }
`;

const AssigneeDot = styled.span`
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
`;

const NextButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover {
    background: var(--surface-hover);
    color: var(--accent);
  }
`;
