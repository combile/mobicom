"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import CustomSelect from "./CustomSelect";
import DatePicker from "./DatePicker";
import GanttChart from "./GanttChart";
import MentionInput from "./MentionInput";
import { parseMentionSegments } from "@/lib/mobion-mentions";
import {
  MILESTONE_KINDS,
  MILESTONE_STATUS_OPTIONS,
  SORT_OPTIONS,
  TASK_STATUS_OPTIONS,
  dueState,
  type SortMode,
  type Task,
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
}: {
  data: TasksData;
  /** Switches the workspace back to the conversation a task came from. */
  onOpenChannel?: (channelId: string) => void;
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
              <DetailAddButton type="button" onClick={data.openCreateMilestone}>
                <span className="material-symbols-outlined">add</span>
                마일스톤
              </DetailAddButton>
              <DetailAddButton type="button" onClick={() => data.openCreateTask()}>
                <span className="material-symbols-outlined">add</span>
                태스크
              </DetailAddButton>
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
        />
      )}
      {data.selectedMilestone && (
        <MilestoneDetailModal key={data.selectedMilestone.id} data={data} />
      )}
      {data.editingProject && data.selectedProject && (
        <EditProjectModal key={data.selectedProject.id} data={data} />
      )}
    </Main>
  );
}

/** Rename a project or fix its description; same draft rules as the others. */
function EditProjectModal({ data }: { data: TasksData }) {
  const { overlayRef, cardRef } = useModalEnterAnimation();
  const project = data.selectedProject!;

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");

  useCloseOnEscape(() => close());
  const close = () => {
    data.setProjectDetailError(null);
    data.setEditingProject(false);
  };

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
function MilestoneDetailModal({ data }: { data: TasksData }) {
  const { overlayRef, cardRef } = useModalEnterAnimation();
  const milestone = data.selectedMilestone!;

  const [title, setTitle] = useState(milestone.title);
  const [status, setStatus] = useState(milestone.status);
  const [kind, setKind] = useState(milestone.kind);
  const [targetDate, setTargetDate] = useState(milestone.targetDate ?? "");

  useCloseOnEscape(() => close());
  const close = () => {
    data.setMilestoneDetailError(null);
    data.setSelectedMilestoneId(null);
  };

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
}: {
  data: TasksData;
  onOpenChannel?: (channelId: string) => void;
}) {
  const { overlayRef, cardRef } = useModalEnterAnimation();
  useCloseOnEscape(() => close());
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

  const close = () => {
    data.setTaskDetailError(null);
    data.setSelectedTaskId(null);
  };

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
    const body = draftComment.trim();
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
            <SourceQuote>{task.sourceExcerpt}</SourceQuote>
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

        <MetaLine>
          {task.createdByName ?? "알 수 없는 사용자"}님이 {formatCreatedAt(task.createdAt)}에 등록
        </MetaLine>

        <CommentSection>
          <CommentHeading>
            논의
            <CommentCount>· {data.comments.length}</CommentCount>
          </CommentHeading>

          {data.comments.map((c) => (
            <Comment key={c.id}>
              {/* an initial is enough to tell speakers apart at a glance, which
                  is what a thread needs more than a boxed card per remark */}
              <CommentAvatar style={{ background: avatarTint(c.authorName ?? "?") }}>
                {(c.authorName ?? "?").charAt(0)}
              </CommentAvatar>
              <CommentMain>
                <CommentMeta>
                  <CommentAuthor>{c.authorName ?? "알 수 없는 사용자"}</CommentAuthor>
                  <CommentTime>{formatCreatedAt(c.createdAt)}</CommentTime>
                </CommentMeta>
                <CommentBody>
                  {parseMentionSegments(c.body).map((seg, i) =>
                    seg.type === "mention" ? (
                      <CommentMention key={i}>@{seg.name}</CommentMention>
                    ) : (
                      <span key={i}>{seg.content}</span>
                    ),
                  )}
                </CommentBody>
              </CommentMain>
            </Comment>
          ))}

          <CommentForm>
            <CommentInputWrap>
              <MentionInput
                value={draftComment}
                onChange={setDraftComment}
                onSend={submitComment}
                users={data.allUsers}
                placeholder="댓글을 남겨주세요..."
              />
            </CommentInputWrap>
            <QuietButton
              type="button"
              onClick={submitComment}
              disabled={data.postingComment || !draftComment.trim()}
            >
              전송
            </QuietButton>
          </CommentForm>
        </CommentSection>

        {data.taskDetailError && <ErrorText>{data.taskDetailError}</ErrorText>}
        <FooterRow>
          <DeleteButton
            busy={data.savingTask}
            label="태스크 삭제"
            onDelete={async () => {
              const ok = await data.deleteTask(task.id);
              if (ok) close();
            }}
          />
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
  const { overlayRef, cardRef } = useModalEnterAnimation();
  useCloseOnEscape(() => data.setShowCreateMilestone(false));

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={() => data.setShowCreateMilestone(false)}>
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
  const { overlayRef, cardRef } = useModalEnterAnimation();
  useCloseOnEscape(() => data.setShowCreateTask(false));

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={() => data.setShowCreateTask(false)}>
      <ModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <ModalTitle>새 태스크 만들기</ModalTitle>
        {/* raised from chat: show what it came from so the title can be edited
            into something that reads as work rather than as a message */}
        {data.taskSource && (
          <SourceNote>
            <span className="material-symbols-outlined">forum</span>
            <SourceQuote>{data.taskSource.excerpt}</SourceQuote>
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
  color: #f0f0f0;
  font-weight: 600;
  line-height: 1.35;
  text-align: left;
  cursor: text;

  &:hover {
    color: #fff;
  }
`;

const TitleInput = styled.input`
  width: 100%;
  padding: 1px 0;
  border: none;
  border-bottom: 1px solid #454545;
  background: transparent;
  color: #f0f0f0;
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
  color: #b4b4b4;
  font-size: 14px;
  line-height: 1.7;
  text-align: left;
  white-space: pre-wrap;
  cursor: text;

  &[data-empty] {
    color: #6a6a6a;
  }

  &:hover {
    color: #d4d4d4;
  }
`;

/* Label and value on one line, repeated — denser than a stack of boxed fields
   and closer to how these values are actually read. */
const Props = styled.div`
  display: flex;
  flex-direction: column;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid #2a2a2a;
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
  color: #7a7a7a;
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
  color: #8a8a8a;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: #2a2a2a;
    color: #d4d4d4;
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
  background: rgba(37, 37, 37, 0.35);
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
  color: #9a9a9a;
  font-size: 14px;
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

const ResetFiltersButton = styled.button`
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(0, 181, 255, 0.28);
  background: rgba(0, 181, 255, 0.12);
  color: #00b5ff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: rgba(0, 181, 255, 0.2);
  }
`;

const ProjectHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 16px;
  margin-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const ProjectTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ProjectName = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: #fff;
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
  color: #767676;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #00b5ff;
  }
`;

const ProjectDescription = styled.p`
  font-size: 13px;
  color: #9a9a9a;
`;

const ProjectMeta = styled.p`
  font-size: 11px;
  color: #767676;
`;

const StatRow = styled.div`
  display: flex;
  gap: 16px;
  margin-top: 2px;
`;

const Stat = styled.span`
  font-size: 12px;
  color: #767676;

  &[data-tone="overdue"] {
    color: #ff6767;
  }
`;

const StatValue = styled.strong`
  color: #d4d4d4;
  font-weight: 700;

  ${Stat}[data-tone="overdue"] & {
    color: #ff6767;
  }
`;

const ProgressTrack = styled.div`
  height: 4px;
  margin-top: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  border-radius: inherit;
  background: #00b5ff;
  transition: width 0.3s ease;
`;

const MilestoneChip = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #9a9a9a;
  font-size: 11px;
  white-space: nowrap;
`;

const TabBar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const Tab = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #9a9a9a;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    color: #d4d4d4;
  }

  &[data-active] {
    color: #fff;
    border-bottom-color: #00b5ff;
  }

  &:focus-visible {
    outline: 2px solid #00b5ff;
    outline-offset: -2px;
  }
`;

const TabCount = styled.span`
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #9a9a9a;
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
  color: #fff;
  white-space: nowrap;
`;

/**
 * Tonal fill, unlike the sidebar's AddButton. This one sits in a section
 * header rather than at the end of a list, so blending it into the rows below
 * would misread it as one of them.
 */
const DetailAddButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(0, 181, 255, 0.28);
  background: rgba(0, 181, 255, 0.12);
  color: #00b5ff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover {
    background: rgba(0, 181, 255, 0.2);
  }
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
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.2);
  }

  &:focus-visible {
    outline: 2px solid #00b5ff;
    outline-offset: 2px;
  }
`;

const LinkedTasks = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
`;

const LinkedHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: #9a9a9a;
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
  color: #d4d4d4;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #00b5ff;
  }

  &:focus-visible {
    outline: 2px solid #00b5ff;
    outline-offset: -2px;
  }

  &[data-done] {
    color: #767676;
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
  color: #767676;
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
  color: #ff6767;
  font-size: 13px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: rgba(255, 103, 103, 0.12);
  }

  &[data-armed] {
    background: #ff6767;
    border-color: #ff6767;
    color: #1a0808;
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
  color: #ff9d5c;
`;

const CancelDelete = styled.button`
  padding: 8px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #9a9a9a;
  font-size: 13px;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: #d4d4d4;
  }
`;

// Right-alignment lives on RowControl, which now wraps every use of this.
const RowSelect = styled(CustomSelect)``;

const MilestoneTitle = styled.span`
  color: #d4d4d4;
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
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
`;

const MiniFill = styled.div`
  height: 100%;
  border-radius: inherit;
  background: #00b5ff;

  &[data-complete] {
    background: #4ade80;
  }
`;

const MilestoneDate = styled.span`
  color: #767676;
  font-size: 12px;

  &[data-tone="overdue"] {
    color: #ff6767;
    font-weight: 600;
  }

  &[data-tone="soon"] {
    color: #ff9d5c;
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
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.25);
  color: #767676;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:focus-within {
    border-color: #00b5ff;
    box-shadow: 0 0 0 3px rgba(0, 181, 255, 0.15);
  }
`;

const SearchInput = styled.input`
  width: 100%;
  min-width: 0;
  padding: 7px 0;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 13px;
  outline: none;

  &::placeholder {
    color: #767676;
  }
`;

const ToggleCount = styled.span`
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 11px;
  font-weight: 700;
`;

const GroupToggle = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: #9a9a9a;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover {
    color: #d4d4d4;
  }

  &[data-active] {
    border-color: rgba(0, 181, 255, 0.28);
    background: rgba(0, 181, 255, 0.12);
    color: #00b5ff;
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
  color: #d4d4d4;

  &[data-unassigned] {
    color: #767676;
    font-weight: 600;
  }
`;

const TaskGroupCount = styled.span`
  font-size: 11px;
  font-weight: 400;
  color: #767676;
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
  color: #767676;
  cursor: pointer;
  opacity: 0;

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
    background: rgba(255, 255, 255, 0.08);
    color: #00b5ff;
  }
`;

const TaskRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.2);
  }

  &:focus-visible {
    outline: 2px solid #00b5ff;
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
  color: #767676;
  text-transform: uppercase;
`;

const TicketBadge = styled.span`
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;

  &[data-tone="overdue"] {
    background: rgba(255, 103, 103, 0.16);
    color: #ff6767;
  }

  &[data-tone="soon"] {
    background: rgba(255, 157, 92, 0.16);
    color: #ff9d5c;
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
  color: #00b5ff;
  font-size: 11px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: rgba(0, 181, 255, 0.12);
  }

  &:disabled {
    color: #767676;
    cursor: default;
  }
`;

const CommentSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
`;

const CommentHeading = styled.h3`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: #9a9a9a;
`;

const CommentCount = styled.span`
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  font-weight: 700;
  color: #d4d4d4;
`;

const CommentEmpty = styled.p`
  color: #767676;
  font-size: 12px;
  padding: 2px 0 4px;
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
  color: #fff;
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
  color: #e4e4e4;
  font-size: 13px;
  font-weight: 600;
`;

const CommentTime = styled.span`
  color: #767676;
  font-size: 11px;
`;

const CommentBody = styled.p`
  color: #c4c4c4;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
`;

const CommentForm = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding-top: 10px;
  border-top: 1px solid #2a2a2a;
`;

const CommentMention = styled.span`
  color: #00b5ff;
  font-weight: 600;
`;

const CommentInputWrap = styled.div`
  flex: 1;
  min-width: 0;
`;

const CommentInput = styled.textarea`
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  outline: none;

  &:focus {
    border-color: #00b5ff;
    box-shadow: 0 0 0 3px rgba(0, 181, 255, 0.15);
  }
`;

const CommentSend = styled.button`
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: #00b5ff;
  color: #061018;
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
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);

  .material-symbols-outlined {
    font-size: 15px;
    color: #00b5ff;
    flex-shrink: 0;
    margin-top: 1px;
  }
`;

const SourceQuote = styled.span`
  flex: 1;
  min-width: 0;
  color: #9a9a9a;
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
  border-top: 1px solid #2a2a2a;
  color: #6f6f6f;
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
  color: #767676;
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
  color: #9a9a9a;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    color: #d4d4d4;
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
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  outline: none;

  &:focus {
    border-color: #00b5ff;
    box-shadow: 0 0 0 3px rgba(0, 181, 255, 0.15);
  }
`;

const TaskTitle = styled.span`
  color: #d4d4d4;
  font-size: 14px;

  &[data-done] {
    color: #767676;
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
  accent-color: #00b5ff;
  cursor: pointer;
`;

const ClaimButton = styled.button`
  margin-left: 4px;
  padding: 1px 6px;
  border: none;
  border-radius: 5px;
  background: rgba(0, 181, 255, 0.12);
  color: #00b5ff;
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
    background: rgba(0, 181, 255, 0.24);
  }
`;

const TaskMeta = styled.span`
  color: #767676;
  font-size: 12px;

  &[data-tone="overdue"] {
    color: #ff6767;
    font-weight: 600;
  }

  &[data-tone="soon"] {
    color: #ff9d5c;
  }
`;
