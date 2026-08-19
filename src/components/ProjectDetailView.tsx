"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import CustomSelect from "./CustomSelect";
import {
  MILESTONE_STATUS_OPTIONS,
  SORT_OPTIONS,
  TASK_STATUS_OPTIONS,
  dueState,
  type SortMode,
  type Task,
  type TasksData,
} from "@/lib/use-tasks-data";
import { useModalEnterAnimation } from "@/lib/use-modal-enter-animation";
import {
  ModalOverlay,
  ModalCard,
  ModalTitle,
  Field,
  ErrorText,
  ModalActions,
} from "./modal-styles";

export default function ProjectDetailView({ data }: { data: TasksData }) {
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

          <DetailSectionHeader>
            <DetailSectionTitle>마일스톤</DetailSectionTitle>
            <DetailAddButton type="button" onClick={data.openCreateMilestone}>
              <span className="material-symbols-outlined">add</span>
              마일스톤 추가
            </DetailAddButton>
          </DetailSectionHeader>
          <MilestoneList>
            {data.milestones.length === 0 && <EmptyState>아직 마일스톤이 없습니다</EmptyState>}
            {data.milestones.map((m) => (
              <MilestoneRow
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => data.setSelectedMilestoneId(m.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    data.setSelectedMilestoneId(m.id);
                  }
                }}
              >
                <MilestoneTitle>{m.title}</MilestoneTitle>
                {m.targetDate && (
                  <MilestoneDate data-tone={dueState(m.targetDate, m.status) ?? undefined}>
                    {m.targetDate}
                  </MilestoneDate>
                )}
                {(() => {
                  const p = data.milestoneProgress.get(m.id);
                  if (!p || p.total === 0) return null;
                  return (
                    <MilestoneProgress>
                      <MiniTrack
                        role="progressbar"
                        aria-valuenow={p.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${m.title} 진행률`}
                      >
                        <MiniFill data-complete={p.done === p.total || undefined} style={{ width: `${p.percent}%` }} />
                      </MiniTrack>
                      <MilestoneDate>
                        {p.done}/{p.total}
                      </MilestoneDate>
                    </MilestoneProgress>
                  );
                })()}
                <RowControl onClick={(e) => e.stopPropagation()}>
                  <RowSelect
                    value={m.status}
                    onChange={(v) => data.updateMilestoneStatus(m.id, v)}
                    options={MILESTONE_STATUS_OPTIONS}
                  />
                </RowControl>
              </MilestoneRow>
            ))}
          </MilestoneList>

          <DetailSectionHeader>
            <DetailSectionTitle>태스크</DetailSectionTitle>
            <DetailAddButton type="button" onClick={() => data.openCreateTask()}>
              <span className="material-symbols-outlined">add</span>
              태스크 추가
            </DetailAddButton>
          </DetailSectionHeader>
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

      {data.showCreateMilestone && <CreateMilestoneModal data={data} />}
      {data.showCreateTask && <CreateTaskModal data={data} />}
      {data.selectedTask && <TaskDetailModal key={data.selectedTask.id} data={data} />}
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
function formatCreatedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
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
      {/* redundant under a milestone heading, so the grouped view turns it off */}
      {showMilestone && task.milestoneId && (
        <MilestoneChip>
          {data.milestones.find((m) => m.id === task.milestoneId)?.title ?? "—"}
        </MilestoneChip>
      )}
      <TaskMeta>{task.assigneeName ?? "미배정"}</TaskMeta>
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
  const [targetDate, setTargetDate] = useState(milestone.targetDate ?? "");

  const close = () => {
    data.setMilestoneDetailError(null);
    data.setSelectedMilestoneId(null);
  };

  async function save() {
    const ok = await data.updateMilestone(milestone.id, {
      title,
      status,
      targetDate: targetDate || null,
    });
    if (ok) close();
  }

  const linked = data.tasks.filter((t) => t.milestoneId === milestone.id);
  const doneLinked = linked.filter((t) => t.status === "done").length;
  const due = dueState(targetDate || null, status);

  // Jumping to a linked task closes this panel and drops the local draft, so
  // the links are held back while there are unsaved edits — same guard the
  // task panel uses for its prev/next steps.
  const dirty =
    title !== milestone.title ||
    status !== milestone.status ||
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
        <TwoUp>
          <Field>
            <label>상태</label>
            <CustomSelect
              fullWidth
              value={status}
              onChange={setStatus}
              options={MILESTONE_STATUS_OPTIONS}
            />
          </Field>
          <Field>
            <label htmlFor="milestone-detail-date">목표 날짜</label>
            <input
              id="milestone-detail-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </Field>
        </TwoUp>

        <LinkedTasks>
          {linked.length === 0 ? (
            <LinkedEmpty>연결된 태스크가 없습니다</LinkedEmpty>
          ) : (
            <>
              <LinkedHeading>
                연결된 태스크 {doneLinked}/{linked.length} 완료
              </LinkedHeading>
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
function TaskDetailModal({ data }: { data: TasksData }) {
  const { overlayRef, cardRef } = useModalEnterAnimation();
  const task = data.selectedTask!;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState(task.status);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "");
  const [milestoneId, setMilestoneId] = useState(task.milestoneId ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");

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
    });
    if (ok) close();
  }

  const due = dueState(dueDate || null, status);

  // Stepping to another task swaps this component's `key`, which discards the
  // local draft. Blocking the step while there are unsaved edits is what stops
  // that from silently throwing away typing.
  const dirty =
    title !== task.title ||
    description !== (task.description ?? "") ||
    status !== task.status ||
    assigneeId !== (task.assigneeId ?? "") ||
    milestoneId !== (task.milestoneId ?? "") ||
    dueDate !== (task.dueDate ?? "");

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={close}>
      <WideModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <TicketTopRow>
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
              title={dirty ? "저장하거나 닫은 뒤 이동할 수 있습니다" : "이전 태스크"}
            >
              <span className="material-symbols-outlined">expand_less</span>
            </StepButton>
            <StepButton
              type="button"
              onClick={() => data.nextTaskId && data.setSelectedTaskId(data.nextTaskId)}
              disabled={!data.nextTaskId || dirty}
              aria-label="다음 태스크"
              title={dirty ? "저장하거나 닫은 뒤 이동할 수 있습니다" : "다음 태스크"}
            >
              <span className="material-symbols-outlined">expand_more</span>
            </StepButton>
          </StepGroup>
        </TicketTopRow>

        <Field>
          <label htmlFor="task-detail-title">제목</label>
          <input
            id="task-detail-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field>
          <label htmlFor="task-detail-description">설명</label>
          <DescriptionArea
            id="task-detail-description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="이 태스크가 무엇인지 적어 두면 다른 사람이 맥락을 잡기 쉽습니다"
          />
        </Field>
        <TwoUp>
          <Field>
            <label>상태</label>
            <CustomSelect
              fullWidth
              value={status}
              onChange={setStatus}
              options={TASK_STATUS_OPTIONS}
            />
          </Field>
          <Field>
            <label htmlFor="task-detail-due">마감일</label>
            <input
              id="task-detail-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </TwoUp>
        <TwoUp>
          <Field>
            <label>담당자</label>
            <CustomSelect
              fullWidth
              value={assigneeId}
              onChange={setAssigneeId}
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
              value={milestoneId}
              onChange={setMilestoneId}
              options={[
                { value: "", label: "없음" },
                ...data.milestones.map((m) => ({ value: m.id, label: m.title })),
              ]}
            />
          </Field>
        </TwoUp>

        <MetaLine>
          {task.createdByName ?? "알 수 없는 사용자"}님이 {formatCreatedAt(task.createdAt)}에 등록
        </MetaLine>

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
      </WideModalCard>
    </ModalOverlay>,
    document.body,
  );
}

// Module scope for the same reason as CreateProjectModal: a component defined
// inside the parent remounts on every parent render and steals focus from the
// input being typed into.
function CreateMilestoneModal({ data }: { data: TasksData }) {
  const { overlayRef, cardRef } = useModalEnterAnimation();

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
          <label htmlFor="new-milestone-date">목표 날짜</label>
          <input
            id="new-milestone-date"
            type="date"
            value={data.newMilestoneTargetDate}
            onChange={(e) => data.setNewMilestoneTargetDate(e.target.value)}
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
            disabled={data.creatingMilestone}
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

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={() => data.setShowCreateTask(false)}>
      <ModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <ModalTitle>새 태스크 만들기</ModalTitle>
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
          <label htmlFor="new-task-due-date">마감일</label>
          <input
            id="new-task-due-date"
            type="date"
            value={data.newTaskDueDate}
            onChange={(e) => data.setNewTaskDueDate(e.target.value)}
          />
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  width: 160px;
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

const MetaLine = styled.p`
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: #767676;
  font-size: 11px;
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
