"use client";

import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import CustomSelect from "./CustomSelect";
import {
  MILESTONE_STATUS_OPTIONS,
  TASK_STATUS_OPTIONS,
  type TasksData,
} from "@/lib/use-tasks-data";
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
        <EmptyState>프로젝트를 선택하거나 새로 만들어 보세요</EmptyState>
      )}
      {data.selectedProjectId && data.detailError && <ErrorText>{data.detailError}</ErrorText>}
      {data.selectedProjectId && !data.detailError && (
        <>
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
              <MilestoneRow key={m.id}>
                <MilestoneTitle>{m.title}</MilestoneTitle>
                {m.targetDate && <MilestoneDate>{m.targetDate}</MilestoneDate>}
                {data.tasks.some((t) => t.milestoneId === m.id) && (
                  <MilestoneDate>
                    {data.tasks.filter((t) => t.milestoneId === m.id && t.status === "done").length}
                    /{data.tasks.filter((t) => t.milestoneId === m.id).length} 완료
                  </MilestoneDate>
                )}
                <RowSelect
                  value={m.status}
                  onChange={(v) => data.updateMilestoneStatus(m.id, v)}
                  options={MILESTONE_STATUS_OPTIONS}
                />
              </MilestoneRow>
            ))}
          </MilestoneList>

          <DetailSectionHeader>
            <DetailSectionTitle>태스크</DetailSectionTitle>
            <DetailAddButton type="button" onClick={data.openCreateTask}>
              <span className="material-symbols-outlined">add</span>
              태스크 추가
            </DetailAddButton>
          </DetailSectionHeader>
          <FilterRow>
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
          </FilterRow>
          <TaskList>
            {data.visibleTasks.length === 0 && (
              <EmptyState>조건에 맞는 태스크가 없습니다</EmptyState>
            )}
            {data.visibleTasks.map((t) => (
              <TaskRow key={t.id}>
                <TaskTitle>{t.title}</TaskTitle>
                <TaskMeta>{t.assigneeName ?? "미배정"}</TaskMeta>
                {t.dueDate && <TaskMeta>{t.dueDate}</TaskMeta>}
                <RowSelect
                  value={t.status}
                  onChange={(v) => data.updateTaskStatus(t.id, v)}
                  options={TASK_STATUS_OPTIONS}
                />
              </TaskRow>
            ))}
          </TaskList>
        </>
      )}

      {data.showCreateMilestone &&
        createPortal(
          <ModalOverlay onClick={() => data.setShowCreateMilestone(false)}>
            <ModalCard onClick={(e) => e.stopPropagation()}>
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
        )}

      {data.showCreateTask &&
        createPortal(
          <ModalOverlay onClick={() => data.setShowCreateTask(false)}>
            <ModalCard onClick={(e) => e.stopPropagation()}>
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
        )}
    </Main>
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
  margin: auto;
  color: #9a9a9a;
  font-size: 14px;
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

const DetailAddButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: auto;
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px dashed rgba(255, 255, 255, 0.24);
  background: transparent;
  color: #9a9a9a;
  font-size: 13px;
  cursor: pointer;
  text-align: left;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover {
    color: #00b5ff;
    border-color: #00b5ff;
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
`;

const RowSelect = styled(CustomSelect)`
  margin-left: auto;
`;

const MilestoneTitle = styled.span`
  color: #d4d4d4;
  font-size: 14px;
`;

const MilestoneDate = styled.span`
  color: #767676;
  font-size: 12px;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
`;

const TaskList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const TaskRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const TaskTitle = styled.span`
  color: #d4d4d4;
  font-size: 14px;
`;

const TaskMeta = styled.span`
  color: #767676;
  font-size: 12px;
`;
