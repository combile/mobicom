"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import CustomSelect from "./CustomSelect";
import DatePicker from "./DatePicker";
import GanttChart from "./GanttChart";
import MentionInput from "./MentionInput";
import {
  parseMentionSegments,
  encodeMentions,
  mentionPlainText,
} from "@/lib/mobion-mentions";
import {
  MILESTONE_KINDS,
  MILESTONE_STATUS_OPTIONS,
  SORT_OPTIONS,
  TASK_STATUS_OPTIONS,
  dueState,
  type SortMode,
  type Task,
  type TaskActivity,
  type TasksData,
} from "@/lib/use-tasks-data";
import { useCloseOnEscape, useModalEnterAnimation } from "@/lib/use-modal-enter-animation";
import {
  ModalOverlay,
  ModalCard,
  ModalTitle,
  Field,
  ErrorText,
  ModalActions,
} from "./modal-styles";

export default function ProjectDetailView({
  data,
  onOpenChannel,
  canDelete = false,
}: {
  data: TasksData;
  /** Switches the workspace back to the conversation a task came from. */
  onOpenChannel?: (channelId: string) => void;
  /** Lead only. Hidden rather than disabled, the same as the overview rail. */
  canDelete?: boolean;
}) {
  return (
    <Main>
      {!data.selectedProjectId && (
        <EmptyState>
          {data.projects.length === 0 ? (
            <>
              <EmptyTitle>아직 프로젝트가 없습니다</EmptyTitle>
              <EmptyHint>왼쪽 사이드바의 &lsquo;프로젝트 추가&rsquo;로 시작해 보세요</EmptyHint>
            </>
          ) : (
            "왼쪽에서 프로젝트를 선택해 주세요"
          )}
        </EmptyState>
      )}
      {data.selectedProjectId && data.detailError && <ErrorText>{data.detailError}</ErrorText>}
      {data.selectedProjectId && !data.detailError && (
        <>
          {data.selectedProject && (
            <ProjectHeader>
              <ProjectTitleRow>
                <ProjectName>{data.selectedProject.name}</ProjectName>
                <EditProjectButton
                  type="button"
                  onClick={() => data.setEditingProject(true)}
                  aria-label="프로젝트 편집"
                  title="프로젝트 편집"
                >
                  <span className="material-symbols-outlined">edit</span>
                </EditProjectButton>
              </ProjectTitleRow>
              {data.selectedProject.description && (
                <ProjectDescription>{data.selectedProject.description}</ProjectDescription>
              )}
              <ProjectMeta>
                {data.selectedProject.createdByName}님이{" "}
                {formatCreatedAt(data.selectedProject.createdAt)}에 생성
              </ProjectMeta>
              <StatRow>
                <Stat>
                  태스크 <StatValue>{data.summary.done}</StatValue>/{data.summary.total}
                </Stat>
                <Stat>
                  마일스톤 <StatValue>{data.summary.milestones}</StatValue>
                </Stat>
                {data.summary.overdue > 0 && (
                  <Stat data-tone="overdue">
                    기한 초과 <StatValue>{data.summary.overdue}</StatValue>
                  </Stat>
                )}
              </StatRow>
              <ProgressTrack
                role="progressbar"
                aria-valuenow={data.summary.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="태스크 완료율"
              >
                <ProgressFill style={{ width: `${data.summary.percent}%` }} />
              </ProgressTrack>
            </ProjectHeader>
          )}

          <TabBar>
            <Tab
              type="button"
              data-active={data.detailTab === "timeline" || undefined}
              onClick={() => data.setDetailTab("timeline")}
              aria-pressed={data.detailTab === "timeline"}
            >
              타임라인
            </Tab>
            <Tab
              type="button"
              data-active={data.detailTab === "list" || undefined}
              onClick={() => data.setDetailTab("list")}
              aria-pressed={data.detailTab === "list"}
            >
              목록
              <TabCount>{data.tasks.length}</TabCount>
            </Tab>
            {/* both add buttons stay put across tabs: what you are looking at
                should not decide what you are allowed to create */}
            <TabActions>
              <MilestoneAddButton type="button" onClick={data.openCreateMilestone}>
                <span className="material-symbols-outlined">add</span>
                마일스톤
              </MilestoneAddButton>
              <TaskAddButton type="button" onClick={() => data.openCreateTask()}>
                <span className="material-symbols-outlined">add</span>
                태스크
              </TaskAddButton>
            </TabActions>
          </TabBar>

          {data.detailTab === "timeline" && (
            <GanttChart
              milestones={data.milestones}
              tasks={data.tasks}
              onOpenTask={(id) => data.setSelectedTaskId(id)}
              onOpenMilestone={(id) => data.setSelectedMilestoneId(id)}
            />
          )}

          {data.detailTab === "list" && (
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
              value={data.statusFilter}
              onChange={data.setStatusFilter}
              options={[{ value: "", label: "모든 상태" }, ...TASK_STATUS_OPTIONS]}
            />
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
            <CustomSelect
              value={data.sortMode}
              onChange={(v) => data.setSortMode(v as SortMode)}
              options={SORT_OPTIONS}
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
            <GroupToggle
              type="button"
              data-active={data.groupMode === "milestone" || undefined}
              onClick={() =>
                data.setGroupMode(data.groupMode === "milestone" ? "none" : "milestone")
              }
              aria-pressed={data.groupMode === "milestone"}
            >
              <span className="material-symbols-outlined">segment</span>
              마일스톤별
            </GroupToggle>
            <GroupToggle
              type="button"
              data-active={data.groupMode === "assignee" || undefined}
              onClick={() =>
                data.setGroupMode(data.groupMode === "assignee" ? "none" : "assignee")
              }
              aria-pressed={data.groupMode === "assignee"}
            >
              <span className="material-symbols-outlined">group</span>
              담당자별
            </GroupToggle>
          </FilterRow>
          {data.visibleTasks.length === 0 && (
            <EmptyState>
              {data.hasActiveFilters ? (
                <>
                  <EmptyTitle>조건에 맞는 태스크가 없습니다</EmptyTitle>
                  {/* the filters span five controls, so undoing them by hand to
                      confirm the list is not actually empty is tedious */}
                  <ResetFiltersButton type="button" onClick={data.resetFilters}>
                    필터 초기화
                  </ResetFiltersButton>
                </>
              ) : (
                <>
                  <EmptyTitle>아직 태스크가 없습니다</EmptyTitle>
                  <EmptyHint>위 &lsquo;태스크 추가&rsquo;로 첫 태스크를 만들어 보세요</EmptyHint>
                </>
              )}
            </EmptyState>
          )}

          {data.groupMode === "none" ? (
            <TaskList>
              {data.visibleTasks.map((t) => (
                <TaskRowItem key={t.id} task={t} data={data} showMilestone />
              ))}
            </TaskList>
          ) : (
            data.groupedTasks.map((group) => (
              <TaskGroup key={group.id ?? "none"}>
                <TaskGroupHeading data-unassigned={group.id === null || undefined}>
                  {group.title}
                  <TaskGroupCount>
                    {group.tasks.filter((t) => t.status === "done").length}/{group.tasks.length}
                  </TaskGroupCount>
                  <GroupAddButton
                    type="button"
                    onClick={() =>
                      data.openCreateTask(
                        data.groupMode === "assignee"
                          ? { assigneeId: group.id }
                          : { milestoneId: group.id },
                      )
                    }
                    aria-label={`${group.title}에 태스크 추가`}
                    title={`${group.title}에 태스크 추가`}
                  >
                    <span className="material-symbols-outlined">add</span>
                  </GroupAddButton>
                </TaskGroupHeading>
                <TaskList>
                  {group.tasks.map((t) => (
                    <TaskRowItem
                      key={t.id}
                      task={t}
                      data={data}
                      // the heading already names it, so only the other mode
                      // needs the milestone chip
                      showMilestone={data.groupMode === "assignee"}
                    />
                  ))}
                </TaskList>
              </TaskGroup>
            ))
          )}
          </>
          )}
        </>
      )}

      {data.showCreateMilestone && <CreateMilestoneModal data={data} />}
      {data.showCreateTask && <CreateTaskModal data={data} />}
      {data.selectedTask && (
        <TaskDetailModal
          key={data.selectedTask.id}
          data={data}
          onOpenChannel={onOpenChannel}
          canDelete={canDelete}
        />
      )}
      {data.selectedMilestone && (
        <MilestoneDetailModal
          key={data.selectedMilestone.id}
          data={data}
          canDelete={canDelete}
        />
      )}
      {data.editingProject && data.selectedProject && (
        <EditProjectModal key={data.selectedProject.id} data={data} />
      )}
    </Main>
  );
}

/** Rename a project or fix its description; same draft rules as the others. */
function EditProjectModal({ data }: { data: TasksData }) {
  const { overlayRef, cardRef, close } = useModalEnterAnimation(() => {
    data.setProjectDetailError(null);
    data.setEditingProject(false);
  });
  const project = data.selectedProject!;

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");

  useCloseOnEscape(close);

  async function save() {
    const ok = await data.updateProject(project.id, { name, description });
    if (ok) close();
  }

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={close}>
      <ModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <ModalTitle>프로젝트 편집</ModalTitle>
        <Field>
          <label htmlFor="project-edit-name">프로젝트 이름</label>
          <input
            id="project-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field>
          <label htmlFor="project-edit-description">설명</label>
          <DescriptionArea
            id="project-edit-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="프로젝트 설명 (선택)"
          />
        </Field>
        {data.projectDetailError && <ErrorText>{data.projectDetailError}</ErrorText>}
        <ModalActions>
          <button type="button" onClick={close}>
            취소
          </button>
          <button type="button" onClick={save} disabled={data.savingProject || !name.trim()}>
            {data.savingProject ? "저장 중..." : "저장"}
          </button>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>,
    document.body,
  );
}

/**
 * Date only — the exact minute a task was filed is rarely what anyone is
 * after, and the panel already carries a lot of numbers.
 *
 * Runs client-side only: the panel opens on click, so this never renders during
 * SSR where the server's locale and timezone could disagree with the browser's.
 */
const AVATAR_TINTS = ["#3b5bdb", "#2f7a5a", "#8b5cf6", "#b45309", "#0e7490", "#9d174d"];

/** Stable colour per person so the same name keeps the same chip across views. */
function avatarTint(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
}

function formatCreatedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * The one status change offered as a button, keyed by where the task is now.
 *
 * Done is included so finishing something is not a one-way door — reopening it
 * otherwise means hunting through the select.
 */
const NEXT_STATUS: Record<string, { value: string; label: string; hint: string }> = {
  todo: { value: "in_progress", label: "진행 시작", hint: "상태를 진행중으로" },
  in_progress: { value: "done", label: "완료", hint: "상태를 완료로" },
  done: { value: "todo", label: "다시 열기", hint: "상태를 할 일로" },
};

/** Milestones use their own vocabulary — planned rather than todo. */
const NEXT_MILESTONE_STATUS: Record<string, { value: string; label: string; hint: string }> = {
  planned: { value: "in_progress", label: "진행 시작", hint: "상태를 진행중으로" },
  in_progress: { value: "done", label: "완료", hint: "상태를 완료로" },
  done: { value: "planned", label: "다시 열기", hint: "상태를 계획으로" },
};

const FIELD_NAMES: Record<string, string> = {
  status: "상태",
  assignee: "담당자",
  milestone: "마일스톤",
  due_date: "마감일",
  start_date: "시작일",
};

/**
 * One change, as a compact `field before → after`.
 *
 * A full sentence would need Korean particles chosen from the preceding
 * syllable's final consonant, and the values here are not all Korean — a
 * milestone named in Latin letters or a bare date has no reliable reading, so
 * every such sentence would carry an "을(를)" that reads as unfinished. The
 * arrow form says the same thing, denser, and is what a change log looks like
 * anyway.
 */
function describeActivity(a: TaskActivity) {
  if (a.field === "description") return "설명 수정";
  if (a.field === "title") return `제목 '${a.from}' → '${a.to}'`;

  // status is stored as its raw code so the wording stays with the select
  const label = (v: string | null) =>
    a.field === "status" ? (TASK_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v) : v;
  const name = FIELD_NAMES[a.field] ?? a.field;
  const from = a.from ? `${label(a.from)} ` : "";

  return `${name} ${from}→ ${a.to ? label(a.to) : "없음"}`;
}

/** One task row, shared by the flat list and the grouped view. */
function TaskRowItem({
  task,
  data,
  showMilestone,
}: {
  task: Task;
  data: TasksData;
  showMilestone: boolean;
}) {
  return (
    <TaskRow
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
      {/* the row opens the detail panel, so this has to keep its click */}
      <CheckControl onClick={(e) => e.stopPropagation()}>
        <CheckBox
          type="checkbox"
          checked={task.status === "done"}
          onChange={(e) => data.updateTaskStatus(task.id, e.target.checked ? "done" : "todo")}
          aria-label={`${task.title} 완료 표시`}
        />
      </CheckControl>
      <TaskTitle data-done={task.status === "done" || undefined}>{task.title}</TaskTitle>
      {/* a task with steps left is not the same as one without, and opening
          each row to find that out is the thing the badge saves */}
      {task.checklistTotal > 0 && (
        <ChecklistChip
          data-complete={task.checklistDone === task.checklistTotal || undefined}
          title={`체크리스트 ${task.checklistDone}/${task.checklistTotal} 완료`}
        >
          <span className="material-symbols-outlined">checklist</span>
          {task.checklistDone}/{task.checklistTotal}
        </ChecklistChip>
      )}
      {/* redundant under a milestone heading, so the grouped view turns it off */}
      {showMilestone && task.milestoneId && (
        <MilestoneChip>
          {data.milestones.find((m) => m.id === task.milestoneId)?.title ?? "—"}
        </MilestoneChip>
      )}
      {task.assigneeName ? (
        <TaskMeta>{task.assigneeName}</TaskMeta>
      ) : (
        <TaskMeta>
          미배정
          {/* claiming unassigned work is the common row-level assignment; any
              other reassignment goes through the detail panel rather than
              putting a second select in every row */}
          {data.currentUserId && (
            <ClaimButton
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.updateTask(task.id, { assigneeId: data.currentUserId });
              }}
              title="나를 담당자로 지정"
            >
              나에게
            </ClaimButton>
          )}
        </TaskMeta>
      )}
      {task.dueDate && (
        <TaskMeta data-tone={dueState(task.dueDate, task.status) ?? undefined}>
          {task.dueDate}
        </TaskMeta>
      )}
      {/* the row opens the detail panel, so the status control has to keep its
          own clicks from reaching it */}
      <RowControl onClick={(e) => e.stopPropagation()}>
        <RowSelect
          value={task.status}
          onChange={(v) => data.updateTaskStatus(task.id, v)}
          options={TASK_STATUS_OPTIONS}
        />
      </RowControl>
    </TaskRow>
  );
}

/**
 * Two-step delete. Deletion is irreversible and there is no undo, so the first
 * press only arms the button; the second one carries it out. A browser
 * `confirm()` would do the same job but blocks the page and cannot say what
 * else the deletion affects.
 */
function DeleteButton({
  busy,
  label,
  confirmHint,
  onDelete,
}: {
  busy: boolean;
  label: string;
  confirmHint?: string;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <DangerButton type="button" onClick={() => setArmed(true)} disabled={busy}>
        {label}
      </DangerButton>
    );
  }

  return (
    <ConfirmGroup>
      <ConfirmText>
        되돌릴 수 없습니다{confirmHint ? ` · ${confirmHint}` : ""}
      </ConfirmText>
      <DangerButton type="button" data-armed onClick={onDelete} disabled={busy}>
        {busy ? "삭제 중..." : "삭제 확인"}
      </DangerButton>
      <CancelDelete type="button" onClick={() => setArmed(false)} disabled={busy}>
        취소
      </CancelDelete>
    </ConfirmGroup>
  );
}

/** Milestone counterpart to TaskDetailModal; same local-draft and `key` rules. */
function MilestoneDetailModal({
  data,
  canDelete,
}: {
  data: TasksData;
  canDelete: boolean;
}) {
  const { overlayRef, cardRef, close } = useModalEnterAnimation(() => {
    data.setMilestoneDetailError(null);
    data.setSelectedMilestoneId(null);
  });
  const milestone = data.selectedMilestone!;

  const [title, setTitle] = useState(milestone.title);
  const [status, setStatus] = useState(milestone.status);
  const [kind, setKind] = useState(milestone.kind);
  const [targetDate, setTargetDate] = useState(milestone.targetDate ?? "");

  useCloseOnEscape(close);

  async function save() {
    const ok = await data.updateMilestone(milestone.id, {
      title,
      status,
      kind,
      targetDate: targetDate || null,
    });
    if (ok) close();
  }

  const linked = data.tasks.filter((t) => t.milestoneId === milestone.id);
  const doneLinked = linked.filter((t) => t.status === "done").length;
  const due = dueState(targetDate || null, status);
  const nextStatus = NEXT_MILESTONE_STATUS[status];

  // Jumping to a linked task closes this panel and drops the local draft, so
  // the links are held back while there are unsaved edits — same guard the
  // task panel uses for its prev/next steps.
  const dirty =
    title !== milestone.title ||
    status !== milestone.status ||
    kind !== milestone.kind ||
    targetDate !== (milestone.targetDate ?? "");

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={close}>
      <WideModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <TicketTopRow>
          <TicketLabel>마일스톤</TicketLabel>
          {due === "overdue" && <TicketBadge data-tone="overdue">기한 초과</TicketBadge>}
          {due === "soon" && <TicketBadge data-tone="soon">마감 임박</TicketBadge>}
        </TicketTopRow>

        <Field>
          <label htmlFor="milestone-detail-title">제목</label>
          <input
            id="milestone-detail-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field>
          <label>유형</label>
          {/* settable only at creation until now, so a checkpoint that turned
              out to be a deliverable had to be deleted and made again */}
          <CustomSelect fullWidth value={kind} onChange={setKind} options={MILESTONE_KINDS} />
        </Field>
        <TwoUp>
          <Field>
            <LabelRow>
              <label>상태</label>
              {nextStatus && (
                <OpenLinkButton
                  type="button"
                  onClick={() => setStatus(nextStatus.value)}
                  title={nextStatus.hint}
                >
                  {nextStatus.label}
                </OpenLinkButton>
              )}
            </LabelRow>
            <CustomSelect
              fullWidth
              value={status}
              onChange={setStatus}
              options={MILESTONE_STATUS_OPTIONS}
            />
          </Field>
          <Field>
            <LabelRow>
              <label>목표 날짜</label>
            </LabelRow>
            <DatePicker block value={targetDate} onChange={setTargetDate} />
          </Field>
        </TwoUp>

        <LinkedTasks>
          <LinkedHeading>
            {linked.length === 0
              ? "연결된 태스크"
              : `연결된 태스크 ${doneLinked}/${linked.length} 완료`}
            <OpenLinkButton
              type="button"
              disabled={dirty}
              title={
                dirty ? "저장하거나 닫은 뒤 추가할 수 있습니다" : "이 마일스톤에 태스크 추가"
              }
              // hands the milestone to the create form so it does not have to
              // be picked again, the same way the group headings do
              onClick={() => {
                data.setSelectedMilestoneId(null);
                data.openCreateTask({ milestoneId: milestone.id });
              }}
            >
              + 태스크
            </OpenLinkButton>
          </LinkedHeading>
          {linked.length === 0 ? (
            <LinkedEmpty>아직 없습니다</LinkedEmpty>
          ) : (
            <>
              {linked.map((t) => (
                <LinkedTask
                  key={t.id}
                  type="button"
                  data-done={t.status === "done" || undefined}
                  disabled={dirty}
                  title={dirty ? "저장하거나 닫은 뒤 이동할 수 있습니다" : t.title}
                  // swaps the open panel for the task's own; the milestone
                  // panel closes so the two never stack
                  onClick={() => {
                    data.setSelectedMilestoneId(null);
                    data.setSelectedTaskId(t.id);
                  }}
                >
                  {t.title}
                </LinkedTask>
              ))}
            </>
          )}
        </LinkedTasks>

        {data.milestoneDetailError && <ErrorText>{data.milestoneDetailError}</ErrorText>}
        <FooterRow>
          {canDelete && (
          <DeleteButton
            busy={data.savingMilestone}
            label="마일스톤 삭제"
            confirmHint={
              linked.length > 0 ? `태스크 ${linked.length}개의 연결이 해제됩니다` : undefined
            }
            onDelete={async () => {
              const ok = await data.deleteMilestone(milestone.id);
              if (ok) close();
            }}
          />
          )}
          <ModalActions>
            <button type="button" onClick={close}>
              닫기
            </button>
            <button type="button" onClick={save} disabled={data.savingMilestone || !title.trim()}>
              {data.savingMilestone ? "저장 중..." : "저장"}
            </button>
          </ModalActions>
        </FooterRow>
      </WideModalCard>
    </ModalOverlay>,
    document.body,
  );
}

/**
 * Ticket-style detail for one task.
 *
 * Edits are held locally and sent on save rather than per keystroke. The `key`
 * on the caller is what resets those local fields when a different task is
 * opened — without it React reuses this instance and keeps the previous task's
 * draft values.
 */
function TaskDetailModal({
  data,
  onOpenChannel,
  canDelete,
}: {
  data: TasksData;
  onOpenChannel?: (channelId: string) => void;
  canDelete: boolean;
}) {
  const { overlayRef, cardRef, close } = useModalEnterAnimation(() => {
    data.setTaskDetailError(null);
    data.setSelectedTaskId(null);
  });
  useCloseOnEscape(close);
  const task = data.selectedTask!;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState(task.status);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "");
  const [milestoneId, setMilestoneId] = useState(task.milestoneId ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [startDate, setStartDate] = useState(task.startDate ?? "");
  const [draftComment, setDraftComment] = useState("");

  /**
   * Which field is currently an input. Everything else renders as text.
   *
   * A panel where every value sits in a visible box reads as a form to fill in
   * rather than a record to read; most visits here are to check something, not
   * to edit it.
   */
  const [editing, setEditing] = useState<null | "title" | "description">(null);
  const [newStep, setNewStep] = useState("");


  async function save() {
    const ok = await data.updateTask(task.id, {
      title,
      description,
      status,
      assigneeId: assigneeId || null,
      milestoneId: milestoneId || null,
      dueDate: dueDate || null,
      startDate: startDate || null,
    });
    if (ok) close();
  }

  async function submitComment() {
    // Same as chat: the box holds "@이름" and the id is attached on the way out.
    const body = encodeMentions(draftComment.trim(), data.allUsers);
    if (!body) return;
    const ok = await data.addComment(task.id, body);
    if (ok) setDraftComment("");
  }

  const due = dueState(dueDate || null, status);
  const nextStatus = NEXT_STATUS[status];

  const dirty =
    title !== task.title ||
    description !== (task.description ?? "") ||
    status !== task.status ||
    assigneeId !== (task.assigneeId ?? "") ||
    milestoneId !== (task.milestoneId ?? "") ||
    dueDate !== (task.dueDate ?? "") ||
    startDate !== (task.startDate ?? "");

  const assigneeName =
    data.allUsers.find((u) => u.id === assigneeId)?.name ?? "미배정";
  const milestoneName =
    data.milestones.find((m) => m.id === milestoneId)?.title ?? "없음";

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={close}>
      <PanelCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <PanelTop>
          <TicketLabel>태스크</TicketLabel>
          {due === "overdue" && <TicketBadge data-tone="overdue">기한 초과</TicketBadge>}
          {due === "soon" && <TicketBadge data-tone="soon">마감 임박</TicketBadge>}
          <StepGroup>
            {data.openTaskIndex >= 0 && (
              <StepPosition>
                {data.openTaskIndex + 1}/{data.visibleTasks.length}
              </StepPosition>
            )}
            <StepButton
              type="button"
              onClick={() => data.prevTaskId && data.setSelectedTaskId(data.prevTaskId)}
              disabled={!data.prevTaskId || dirty}
              aria-label="이전 태스크"
            >
              <span className="material-symbols-outlined">expand_less</span>
            </StepButton>
            <StepButton
              type="button"
              onClick={() => data.nextTaskId && data.setSelectedTaskId(data.nextTaskId)}
              disabled={!data.nextTaskId || dirty}
              aria-label="다음 태스크"
            >
              <span className="material-symbols-outlined">expand_more</span>
            </StepButton>
          </StepGroup>
        </PanelTop>

        {editing === "title" ? (
          <TitleInput
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setEditing(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditing(null);
            }}
          />
        ) : (
          <TitleText type="button" onClick={() => setEditing("title")}>
            {title || "제목 없음"}
          </TitleText>
        )}

        {editing === "description" ? (
          <DescriptionArea
            autoFocus
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => setEditing(null)}
            placeholder="이 태스크가 무엇인지 적어 두면 다른 사람이 맥락을 잡기 쉽습니다"
          />
        ) : (
          <DescriptionText
            type="button"
            onClick={() => setEditing("description")}
            data-empty={!description || undefined}
          >
            {description || "설명 추가"}
          </DescriptionText>
        )}

        {task.sourceChannelId && (
          <SourceNote>
            <span className="material-symbols-outlined">forum</span>
            <SourceQuote>{mentionPlainText(task.sourceExcerpt ?? "")}</SourceQuote>
            <QuietButton
              type="button"
              disabled={dirty}
              onClick={() => {
                data.setSelectedTaskId(null);
                onOpenChannel?.(task.sourceChannelId!);
              }}
            >
              대화 보기
            </QuietButton>
          </SourceNote>
        )}

        <Props>
          <PropRow>
            <PropLabel>상태</PropLabel>
            <PropValue>
              <BareSelect value={status} onChange={setStatus} options={TASK_STATUS_OPTIONS} />
              {nextStatus && (
                <QuietButton type="button" onClick={() => setStatus(nextStatus.value)}>
                  {nextStatus.label}
                </QuietButton>
              )}
            </PropValue>
          </PropRow>
          <PropRow>
            <PropLabel>담당자</PropLabel>
            <PropValue>
              <BareSelect
                value={assigneeId}
                onChange={setAssigneeId}
                options={[
                  { value: "", label: "미배정" },
                  ...data.allUsers.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
              {data.currentUserId && assigneeId !== data.currentUserId && (
                <QuietButton
                  type="button"
                  onClick={() => setAssigneeId(data.currentUserId!)}
                  title={`${assigneeName} → 나`}
                >
                  나에게
                </QuietButton>
              )}
            </PropValue>
          </PropRow>
          <PropRow>
            <PropLabel>마일스톤</PropLabel>
            <PropValue>
              <BareSelect
                value={milestoneId}
                onChange={setMilestoneId}
                options={[
                  { value: "", label: "없음" },
                  ...data.milestones.map((m) => ({ value: m.id, label: m.title })),
                ]}
              />
              {milestoneId && (
                <QuietButton
                  type="button"
                  disabled={dirty}
                  title={`${milestoneName} 열기`}
                  onClick={() => {
                    data.setSelectedTaskId(null);
                    data.setSelectedMilestoneId(milestoneId);
                  }}
                >
                  열기
                </QuietButton>
              )}
            </PropValue>
          </PropRow>
          <PropRow>
            <PropLabel>시작일</PropLabel>
            <PropValue>
              <DatePicker value={startDate} onChange={setStartDate} />
            </PropValue>
          </PropRow>
          <PropRow>
            <PropLabel>마감일</PropLabel>
            <PropValue>
              <DatePicker value={dueDate} onChange={setDueDate} />
            </PropValue>
          </PropRow>
        </Props>

        <ChecklistSection>
          <CommentHeading>
            체크리스트
            {data.checklist.length > 0 && (
              <CommentCount>
                {data.checklist.filter((i) => i.done).length}/{data.checklist.length}
              </CommentCount>
            )}
          </CommentHeading>

          {data.checklist.map((item) => (
            <ChecklistRow key={item.id}>
              <CheckBox
                type="checkbox"
                checked={item.done}
                onChange={(e) => data.toggleChecklistItem(item.id, e.target.checked)}
                aria-label={`${item.label} 완료 표시`}
              />
              <ChecklistLabel data-done={item.done || undefined}>{item.label}</ChecklistLabel>
              {/* only on hover: a delete control beside every step turns a
                  checklist into a column of buttons */}
              <ChecklistRemove
                type="button"
                onClick={() => data.deleteChecklistItem(item.id)}
                title={`${item.label} 삭제`}
              >
                <span className="material-symbols-outlined">close</span>
              </ChecklistRemove>
            </ChecklistRow>
          ))}

          <ChecklistAdd
            value={newStep}
            placeholder="할 일 추가"
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={async (e) => {
              // Enter rather than a button: steps are usually written several
              // at a time, and reaching for a button between each breaks that
              if (e.key !== "Enter" || !newStep.trim()) return;
              e.preventDefault();
              const ok = await data.addChecklistItem(task.id, newStep.trim());
              if (ok) setNewStep("");
            }}
          />
        </ChecklistSection>

        <MetaLine>
          {task.createdByName ?? "알 수 없는 사용자"}님이 {formatCreatedAt(task.createdAt)}에 등록
        </MetaLine>

        <CommentSection>
          <CommentHeading>
            논의
            <CommentCount>· {data.comments.length}</CommentCount>
          </CommentHeading>

          {data.timeline.map((entry) =>
            entry.kind === "activity" ? (
              <ActivityLine key={`a-${entry.id}`}>
                <ActivityDot />
                <ActivityWho>{entry.activity.actorName ?? "알 수 없는 사용자"}</ActivityWho>
                <span>{describeActivity(entry.activity)}</span>
                <ActivityTime>{formatCreatedAt(entry.activity.createdAt)}</ActivityTime>
              </ActivityLine>
            ) : (
              <Comment key={`c-${entry.id}`}>
                {/* an initial is enough to tell speakers apart at a glance,
                    which is what a thread needs more than a boxed card per
                    remark */}
                <CommentAvatar
                  style={{ background: avatarTint(entry.comment.authorName ?? "?") }}
                >
                  {(entry.comment.authorName ?? "?").charAt(0)}
                </CommentAvatar>
                <CommentMain>
                  <CommentMeta>
                    <CommentAuthor>
                      {entry.comment.authorName ?? "알 수 없는 사용자"}
                    </CommentAuthor>
                    <CommentTime>{formatCreatedAt(entry.comment.createdAt)}</CommentTime>
                  </CommentMeta>
                  <CommentBody>
                    {parseMentionSegments(entry.comment.body).map((seg, i) =>
                      seg.type === "mention" ? (
                        <CommentMention key={i}>@{seg.name}</CommentMention>
                      ) : (
                        <span key={i}>{seg.content}</span>
                      ),
                    )}
                  </CommentBody>
                </CommentMain>
              </Comment>
            ),
          )}

          <CommentForm>
            <CommentInputWrap>
              <MentionInput
                value={draftComment}
                onChange={setDraftComment}
                onSend={submitComment}
                users={data.allUsers}
                placeholder="댓글 남기기"
              />
            </CommentInputWrap>
            {/* Enter already sends, so the button only appears once there is
                something to send — a permanently greyed-out button beside an
                empty field is what makes the area read as a form */}
            {draftComment.trim() && (
              <QuietButton type="button" onClick={submitComment} disabled={data.postingComment}>
                {data.postingComment ? "남기는 중..." : "남기기"}
              </QuietButton>
            )}
          </CommentForm>
        </CommentSection>

        {data.taskDetailError && <ErrorText>{data.taskDetailError}</ErrorText>}
        <FooterRow>
          {canDelete && (
          <DeleteButton
            busy={data.savingTask}
            label="태스크 삭제"
            onDelete={async () => {
              const ok = await data.deleteTask(task.id);
              if (ok) close();
            }}
          />
          )}
          <ModalActions>
            <button type="button" onClick={close}>
              닫기
            </button>
            <button type="button" onClick={save} disabled={data.savingTask || !title.trim()}>
              {data.savingTask ? "저장 중..." : "저장"}
            </button>
          </ModalActions>
        </FooterRow>
      </PanelCard>
    </ModalOverlay>,
    document.body,
  );
}

/** Milestone counterpart to TaskDetailModal; same local-draft and `key` rules. */
function CreateMilestoneModal({ data }: { data: TasksData }) {
  const { overlayRef, cardRef, close } = useModalEnterAnimation(() =>
    data.setShowCreateMilestone(false),
  );
  useCloseOnEscape(close);

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={close}>
      <ModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <ModalTitle>새 마일스톤 만들기</ModalTitle>
        <Field>
          <label htmlFor="new-milestone-title">제목</label>
          <input
            id="new-milestone-title"
            value={data.newMilestoneTitle}
            onChange={(e) => data.setNewMilestoneTitle(e.target.value)}
          />
        </Field>
        <Field>
          <label>유형</label>
          <CustomSelect
            fullWidth
            value={data.newMilestoneKind}
            onChange={data.setNewMilestoneKind}
            options={MILESTONE_KINDS}
          />
        </Field>
        <Field>
          <LabelRow>
            <label>목표 날짜 (필수)</label>
          </LabelRow>
          <DatePicker
            block
            value={data.newMilestoneTargetDate}
            onChange={data.setNewMilestoneTargetDate}
          />
        </Field>
        {data.createMilestoneError && <ErrorText>{data.createMilestoneError}</ErrorText>}
        <ModalActions>
          <button type="button" onClick={() => data.setShowCreateMilestone(false)}>
            취소
          </button>
          <button
            type="button"
            onClick={data.handleCreateMilestone}
            disabled={
              data.creatingMilestone ||
              !data.newMilestoneTitle.trim() ||
              // a checkpoint without a date cannot sit on a timeline
              !data.newMilestoneTargetDate
            }
          >
            {data.creatingMilestone ? "만드는 중..." : "만들기"}
          </button>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>,
    document.body,
  );
}

function CreateTaskModal({ data }: { data: TasksData }) {
  const { overlayRef, cardRef, close } = useModalEnterAnimation(() =>
    data.setShowCreateTask(false),
  );
  useCloseOnEscape(close);

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={close}>
      <ModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <ModalTitle>새 태스크 만들기</ModalTitle>
        {/* raised from chat: show what it came from so the title can be edited
            into something that reads as work rather than as a message */}
        {data.taskSource && (
          <SourceNote>
            <span className="material-symbols-outlined">forum</span>
            <SourceQuote>{mentionPlainText(data.taskSource.excerpt)}</SourceQuote>
          </SourceNote>
        )}
        <Field>
          <label htmlFor="new-task-title">제목</label>
          <input
            id="new-task-title"
            value={data.newTaskTitle}
            onChange={(e) => data.setNewTaskTitle(e.target.value)}
          />
        </Field>
        <Field>
          <label htmlFor="new-task-description">설명</label>
          <input
            id="new-task-description"
            value={data.newTaskDescription}
            onChange={(e) => data.setNewTaskDescription(e.target.value)}
            placeholder="태스크 설명 (선택)"
          />
        </Field>
        <Field>
          <label>담당자</label>
          <CustomSelect
            fullWidth
            value={data.newTaskAssigneeId}
            onChange={data.setNewTaskAssigneeId}
            options={[
              { value: "", label: "미배정" },
              ...data.allUsers.map((u) => ({ value: u.id, label: u.name })),
            ]}
          />
        </Field>
        <Field>
          <label>마일스톤</label>
          <CustomSelect
            fullWidth
            value={data.newTaskMilestoneId}
            onChange={data.setNewTaskMilestoneId}
            options={[
              { value: "", label: "없음" },
              ...data.milestones.map((m) => ({ value: m.id, label: m.title })),
            ]}
          />
        </Field>
        <Field>
          <LabelRow>
            <label>마감일</label>
          </LabelRow>
          <DatePicker block value={data.newTaskDueDate} onChange={data.setNewTaskDueDate} />
        </Field>
        {data.createTaskError && <ErrorText>{data.createTaskError}</ErrorText>}
        <ModalActions>
          <button type="button" onClick={() => data.setShowCreateTask(false)}>
            취소
          </button>
          <button type="button" onClick={data.handleCreateTask} disabled={data.creatingTask}>
            {data.creatingTask ? "만드는 중..." : "만들기"}
          </button>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>,
    document.body,
  );
}

/** Slightly narrower than the create dialogs: this is a record to read, and a
 *  shorter measure keeps the property rows scannable. */
const PanelCard = styled(ModalCard)`
  /* 420px packed the property rows and the thread into a column too narrow to
     scan; this is a working surface, not a confirm dialog */
  width: min(620px, calc(100% - 64px));
  max-height: 84vh;
  gap: 14px;
  padding: 26px 28px;
`;

const PanelTop = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

/* Title and description read as content, not as fields, until clicked. */
const TitleText = styled.button`
  display: block;
  width: 100%;
  padding: 2px 0;
  font-size: 20px;
  border: none;
  background: transparent;
  color: var(--text-strong);
  font-weight: 600;
  line-height: 1.35;
  text-align: left;
  cursor: text;

  &:hover {
    color: var(--text-strong);
  }
`;

const TitleInput = styled.input`
  width: 100%;
  padding: 1px 0;
  border: none;
  border-bottom: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-strong);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;
  outline: none;
`;

const DescriptionText = styled.button`
  display: block;
  width: 100%;
  padding: 0 0 2px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  line-height: 1.7;
  text-align: left;
  white-space: pre-wrap;
  cursor: text;

  &[data-empty] {
    color: var(--text-faint);
  }

  &:hover {
    color: var(--text);
  }
`;

/* Label and value on one line, repeated — denser than a stack of boxed fields
   and closer to how these values are actually read. */
const Props = styled.div`
  display: flex;
  flex-direction: column;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
`;

const PropRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
`;

const PropLabel = styled.span`
  width: 82px;
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 13px;
`;

const PropValue = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
`;

/* No box until you interact with it. */
const BareSelect = styled(CustomSelect)`
  min-width: 0;
`;


/* Secondary actions: legible, but not competing with the values they sit next
   to. Previously every one of these was accent blue. */
const QuietButton = styled.button`
  padding: 3px 9px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--text);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

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

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: auto;
  padding: 24px 0;
  color: var(--text-muted);
  font-size: 14px;
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

const ResetFiltersButton = styled.button`
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: var(--accent-soft);
  }
`;

const ProjectHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 16px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border);
`;

const ProjectTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ProjectName = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: var(--text-strong);
`;

const EditProjectButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover {
    background: var(--surface-hover);
    color: var(--accent);
  }
`;

const ProjectDescription = styled.p`
  font-size: 13px;
  color: var(--text-muted);
`;

const ProjectMeta = styled.p`
  font-size: 11px;
  color: var(--text-faint);
`;

const StatRow = styled.div`
  display: flex;
  gap: 16px;
  margin-top: 2px;
`;

const Stat = styled.span`
  font-size: 12px;
  color: var(--text-faint);

  &[data-tone="overdue"] {
    color: var(--danger);
  }
`;

const StatValue = styled.strong`
  color: var(--text);
  font-weight: 700;

  ${Stat}[data-tone="overdue"] & {
    color: var(--danger);
  }
`;

const ProgressTrack = styled.div`
  height: 4px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--surface-active);
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 0.3s ease;
`;

const MilestoneChip = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
`;

const TabBar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
`;

const Tab = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    color: var(--text);
  }

  &[data-active] {
    color: var(--text-strong);
    border-bottom-color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
`;

const TabCount = styled.span`
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-active);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 400;
`;

const TabActions = styled.div`
  display: flex;
  gap: 6px;
  margin-left: auto;
  padding-bottom: 6px;
`;

const DetailSectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const DetailSectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: var(--text-strong);
  white-space: nowrap;
`;

/**
 * Each button wears the colour of the thing it makes.
 *
 * A milestone is already a lavender diamond on the timeline and a task is
 * already a blue bar under it, so the buttons are not being decorated — they
 * are quoting their own output. That is also why they are not the same colour
 * as each other: two identical grey controls said "add something" twice and
 * left the reader to find out which.
 *
 * Pastel fill with no border. The earlier version was filled *and* outlined in
 * a saturated accent, which is what made two ordinary controls the loudest
 * thing on screen; a soft ground with a deeper label carries the same identity
 * at a fraction of the volume.
 */
const DetailAddButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 6px 12px 6px 9px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: var(--tint-soft);
  color: var(--tint);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.14s cubic-bezier(0.34, 1.3, 0.64, 1), box-shadow 0.14s ease,
    border-color 0.14s ease;

  .material-symbols-outlined {
    font-size: 16px;
    /* the sign turns into the thing it opens */
    transition: transform 0.22s cubic-bezier(0.34, 1.3, 0.64, 1);
  }

  &:hover {
    transform: translateY(-1px);
    border-color: var(--tint);
    box-shadow: 0 3px 10px var(--tint-soft);
  }

  &:hover .material-symbols-outlined {
    transform: rotate(90deg);
  }

  &:active {
    transform: translateY(0);
    box-shadow: none;
  }

  &:focus-visible {
    outline: 2px solid var(--tint);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &,
    &:hover,
    &:active {
      transform: none;
    }

    .material-symbols-outlined {
      transition: none;
    }

    &:hover .material-symbols-outlined {
      transform: none;
    }
  }
`;

/** Lavender, matching the diamond this button puts on the timeline. */
const MilestoneAddButton = styled(DetailAddButton)`
  --tint: var(--milestone);
  --tint-soft: var(--milestone-soft);
`;

/** Blue, matching the bars that hang under a milestone. */
const TaskAddButton = styled(DetailAddButton)`
  --tint: var(--accent);
  --tint-soft: var(--accent-soft);
`;

const MilestoneList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 24px;
`;

const MilestoneRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  cursor: pointer;

  &:hover {
    background: var(--surface-hover);
    border-color: var(--border-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const LinkedTasks = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
`;

const LinkedHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
  padding: 6px 0 2px;
`;

const LinkedTask = styled.button`
  display: block;
  width: 100%;
  padding: 5px 8px;
  margin: 0 -8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--surface-hover);
    color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  &[data-done] {
    color: var(--text-faint);
    text-decoration: line-through;
  }

  &:disabled {
    cursor: default;
    opacity: 0.55;
  }

  &:disabled:hover {
    background: transparent;
    color: inherit;
  }
`;

const LinkedEmpty = styled.div`
  font-size: 12px;
  color: var(--text-faint);
  padding: 8px 0;
`;

const FooterRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const DangerButton = styled.button`
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--danger);
  font-size: 13px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--danger-soft);
  }

  &[data-armed] {
    background: var(--danger);
    border-color: var(--danger);
    color: var(--on-solid);
    font-weight: 700;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const ConfirmGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const ConfirmText = styled.span`
  font-size: 12px;
  color: var(--warn);
`;

const CancelDelete = styled.button`
  padding: 8px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--text);
  }
`;

// Right-alignment lives on RowControl, which now wraps every use of this.
const RowSelect = styled(CustomSelect)``;

const MilestoneTitle = styled.span`
  color: var(--text);
  font-size: 14px;
`;

const MilestoneProgress = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const MiniTrack = styled.div`
  width: 56px;
  height: 3px;
  border-radius: 999px;
  background: var(--surface-active);
  overflow: hidden;
`;

const MiniFill = styled.div`
  height: 100%;
  border-radius: inherit;
  background: var(--accent);

  &[data-complete] {
    background: var(--ok);
  }
`;

const MilestoneDate = styled.span`
  color: var(--text-faint);
  font-size: 12px;

  &[data-tone="overdue"] {
    color: var(--danger);
    font-weight: 600;
  }

  &[data-tone="soon"] {
    color: var(--warn);
  }
`;

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  /* three view toggles now sit alongside the selects; without wrapping they
     squeeze the filters at narrow widths */
  flex-wrap: wrap;
`;

const TaskList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SearchWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  /* takes the leftover width so the selects and toggles stay on one row
     instead of wrapping the moment the pane narrows */
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

const ToggleCount = styled.span`
  padding: 0 5px;
  border-radius: 999px;
  background: var(--surface-active);
  font-size: 11px;
  font-weight: 700;
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

const TaskGroup = styled.section`
  margin-bottom: 16px;
`;

const TaskGroupHeading = styled.h3`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);

  &[data-unassigned] {
    color: var(--text-faint);
    font-weight: 600;
  }
`;

const TaskGroupCount = styled.span`
  font-size: 11px;
  font-weight: 400;
  color: var(--text-faint);
`;

const GroupAddButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;

  .material-symbols-outlined {
    font-size: 16px;
  }

  /* revealed on hover so the headings stay clean, but focus brings it back for
     keyboard users, who never trigger hover */
  ${TaskGroupHeading}:hover &,
  &:focus-visible {
    opacity: 1;
  }

  &:hover {
    background: var(--surface-hover);
    color: var(--accent);
  }
`;

const TaskRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  cursor: pointer;

  &:hover {
    background: var(--surface-hover);
    border-color: var(--border-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const RowControl = styled.div`
  margin-left: auto;
  cursor: default;
`;

const WideModalCard = styled(ModalCard)`
  width: min(520px, calc(100% - 48px));
`;

const TicketTopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TicketLabel = styled.span`
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-faint);
  text-transform: uppercase;
`;

const TicketBadge = styled.span`
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;

  &[data-tone="overdue"] {
    background: var(--danger-soft);
    color: var(--danger);
  }

  &[data-tone="soon"] {
    background: var(--warn-soft);
    color: var(--warn);
  }
`;


const LabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const OpenLinkButton = styled.button`
  padding: 1px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--accent-soft);
  }

  &:disabled {
    color: var(--text-faint);
    cursor: default;
  }
`;

const CommentSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
`;

const CommentHeading = styled.h3`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
`;

const CommentCount = styled.span`
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-active);
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
`;

const ChecklistSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
`;

const ChecklistRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 4px;
  margin: 0 -4px;
  border-radius: 4px;

  &:hover {
    background: var(--surface-hover);
  }
`;

const ChecklistLabel = styled.span`
  flex: 1;
  min-width: 0;
  color: var(--text);
  font-size: 13px;

  &[data-done] {
    color: var(--text-faint);
    text-decoration: line-through;
  }
`;

const ChecklistRemove = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-faint);
  opacity: 0;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 14px;
  }

  ${ChecklistRow}:hover &,
  &:focus-visible {
    opacity: 1;
  }

  &:hover {
    background: var(--danger-soft);
    color: var(--danger);
  }
`;

const ChecklistAdd = styled.input`
  margin-top: 4px;
  padding: 5px 4px;
  border: none;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  outline: none;

  &::placeholder {
    color: var(--text-faint);
  }

  &:focus {
    border-bottom-color: var(--border-strong);
  }
`;

const ChecklistChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px 1px 5px;
  border-radius: 4px;
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

/* A change is context for the remarks around it, not an entry competing with
   them — one quiet line, no avatar, no card. */
const ActivityLine = styled.div`
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 3px 0;
  color: var(--text-faint);
  font-size: 12px;
`;

const ActivityDot = styled.span`
  width: 4px;
  height: 4px;
  flex-shrink: 0;
  /* sits on the same left edge as the comment avatars above and below */
  margin: 0 8px;
  border-radius: 50%;
  background: var(--border-strong);
`;

const ActivityWho = styled.span`
  color: var(--text-muted);
`;

const ActivityTime = styled.span`
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-faint);
  font-size: 11px;
`;


/* No card per comment: a thread is a sequence of remarks, and boxing each one
   turns a short exchange into a stack of panels. */
const Comment = styled.div`
  display: flex;
  gap: 10px;
  padding: 8px 0;
`;

const CommentAvatar = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 50%;
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 700;
`;

const CommentMain = styled.div`
  flex: 1;
  min-width: 0;
`;

const CommentMeta = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
`;

const CommentAuthor = styled.span`
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 600;
`;

const CommentTime = styled.span`
  color: var(--text-faint);
  font-size: 11px;
`;

const CommentBody = styled.p`
  color: var(--text);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
`;

const CommentForm = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
`;

const CommentMention = styled.span`
  color: var(--accent);
  font-weight: 600;
`;

/* MentionInput renders a bare input and leaves the look to whoever places it.
   The same underline the checklist field uses, so the two ends of the panel do
   not disagree about what an input is. */
const CommentInputWrap = styled.div`
  flex: 1;
  min-width: 0;

  input {
    width: 100%;
    padding: 6px 2px;
    border: none;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    outline: none;
  }

  input::placeholder {
    color: var(--text-faint);
  }

  input:focus {
    border-bottom-color: var(--border-strong);
  }
`;



const CommentSend = styled.button`
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: var(--on-solid);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const SourceNote = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-hover);

  .material-symbols-outlined {
    font-size: 15px;
    color: var(--accent);
    flex-shrink: 0;
    margin-top: 1px;
  }
`;

const SourceQuote = styled.span`
  flex: 1;
  min-width: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
  /* a long message should not push the buttons off the card */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const MetaLine = styled.p`
  margin-top: 4px;
  padding: 10px 0 2px;
  border-top: 1px solid var(--border);
  color: var(--text-faint);
  font-size: 12px;
  line-height: 1.5;
`;

const StepGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
`;

const StepPosition = styled.span`
  margin-right: 6px;
  font-size: 11px;
  color: var(--text-faint);
`;

const StepButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--text);
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
`;

const TwoUp = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`;

const DescriptionArea = styled.textarea`
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--surface-sunken);
  color: var(--text-strong);
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  outline: none;

  &:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
`;

const TaskTitle = styled.span`
  color: var(--text);
  font-size: 14px;

  &[data-done] {
    color: var(--text-faint);
    text-decoration: line-through;
  }
`;

const CheckControl = styled.span`
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  cursor: default;
`;

const CheckBox = styled.input`
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
`;

const ClaimButton = styled.button`
  margin-left: 4px;
  padding: 1px 6px;
  border: none;
  border-radius: 5px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  opacity: 0;

  /* kept out of sight until the row is engaged, so a list of unassigned tasks
     does not read as a wall of buttons */
  ${TaskRow}:hover &,
  &:focus-visible {
    opacity: 1;
  }

  &:hover {
    background: var(--accent-soft);
  }
`;

const TaskMeta = styled.span`
  color: var(--text-faint);
  font-size: 12px;

  &[data-tone="overdue"] {
    color: var(--danger);
    font-weight: 600;
  }

  &[data-tone="soon"] {
    color: var(--warn);
  }
`;
