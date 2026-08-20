"use client";

import styled from "@emotion/styled";
import { todayISO, type Milestone, type Task } from "@/lib/use-tasks-data";

const DAY_MS = 24 * 60 * 60 * 1000;

function toDay(iso: string) {
  return Math.floor(new Date(`${iso}T00:00:00`).getTime() / DAY_MS);
}

function monthOf(day: number) {
  const d = new Date(day * DAY_MS);
  const month = d.getUTCMonth() + 1;
  return { label: `${month}월`, key: `${d.getUTCFullYear()}-${month}` };
}

/**
 * Project timeline: milestones as points, tasks as spans, one summary bar per
 * milestone group.
 *
 * Milestones are diamonds rather than bars because a checkpoint marks a moment,
 * not a stretch of work — what takes time is the group underneath it. That
 * grouping is what makes the chart readable: a flat list of every task says
 * less than "this milestone covers these, and they run this long".
 */
export default function GanttChart({
  milestones,
  tasks,
  onOpenTask,
  onOpenMilestone,
}: {
  milestones: Milestone[];
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
}) {
  const dated = tasks.filter((t) => t.dueDate || t.startDate);
  const points = [
    ...milestones.filter((m) => m.targetDate).map((m) => toDay(m.targetDate!)),
    ...dated.flatMap((t) => [t.startDate, t.dueDate].filter(Boolean).map((d) => toDay(d!))),
  ];

  if (points.length === 0) {
    return <Empty>날짜가 있는 마일스톤이나 태스크가 생기면 여기에 타임라인이 그려집니다</Empty>;
  }

  const today = toDay(todayISO());
  // today is always on the chart so "where are we now" is answerable, and the
  // ends are padded so markers at the extremes are not clipped by the frame
  const min = Math.min(...points, today) - 3;
  const max = Math.max(...points, today) + 3;
  const span = Math.max(1, max - min);
  const pct = (day: number) => ((day - min) / span) * 100;

  const ticks: { left: number; label: string }[] = [];
  let seen = "";
  for (let d = min; d <= max; d++) {
    const { label, key } = monthOf(d);
    if (key !== seen) {
      seen = key;
      ticks.push({ left: pct(d), label });
    }
  }

  const groups = milestones
    .filter((m) => m.targetDate)
    .map((m) => ({ milestone: m, tasks: dated.filter((t) => t.milestoneId === m.id) }));
  const grouped = new Set(groups.flatMap((g) => g.tasks.map((t) => t.id)));
  const loose = dated.filter((t) => !grouped.has(t.id));

  return (
    <Chart>
      <Axis>
        {ticks.map((t) => (
          <Tick key={`${t.left}-${t.label}`} style={{ left: `${t.left}%` }}>
            {t.label}
          </Tick>
        ))}
        <TodayLine style={{ left: `${pct(today)}%` }} title="오늘" />
      </Axis>

      {groups.map(({ milestone, tasks: groupTasks }) => {
        const dates = groupTasks.flatMap((t) =>
          [t.startDate, t.dueDate].filter(Boolean).map((d) => toDay(d!)),
        );
        const done = groupTasks.filter((t) => t.status === "done").length;
        return (
          <Group key={milestone.id}>
            <Row>
              <GroupHead
                type="button"
                onClick={() => onOpenMilestone(milestone.id)}
                title={`${milestone.title} 열기`}
              >
                <GroupName>{milestone.title}</GroupName>
                {groupTasks.length > 0 && (
                  <GroupCount>
                    {done}/{groupTasks.length}
                  </GroupCount>
                )}
              </GroupHead>
              <Lane>
                {dates.length > 0 && (
                  <SummaryBar
                    style={{
                      left: `${pct(Math.min(...dates))}%`,
                      width: `${Math.max(0.6, pct(Math.max(...dates)) - pct(Math.min(...dates)))}%`,
                    }}
                  />
                )}
                <Diamond
                  data-status={milestone.status}
                  style={{ left: `${pct(toDay(milestone.targetDate!))}%` }}
                  title={`${milestone.title} · ${milestone.targetDate}`}
                />
              </Lane>
            </Row>

            {groupTasks.map((t) => (
              <Row key={t.id}>
                <TaskName
                  type="button"
                  onClick={() => onOpenTask(t.id)}
                  data-done={t.status === "done" || undefined}
                  title={`${t.title} 열기`}
                >
                  {t.title}
                </TaskName>
                <Lane>
                  <Bar
                    data-status={t.status}
                    style={barStyle(t, pct)}
                    title={`${t.startDate ?? "시작일 없음"} → ${t.dueDate ?? "마감일 없음"}`}
                  />
                </Lane>
              </Row>
            ))}
          </Group>
        );
      })}

      {loose.length > 0 && (
        <Group>
          <Row>
            <PlainHead>마일스톤 없음</PlainHead>
            <Lane />
          </Row>
          {loose.map((t) => (
            <Row key={t.id}>
              <TaskName
                type="button"
                onClick={() => onOpenTask(t.id)}
                data-done={t.status === "done" || undefined}
              >
                {t.title}
              </TaskName>
              <Lane>
                <Bar data-status={t.status} style={barStyle(t, pct)} />
              </Lane>
            </Row>
          ))}
        </Group>
      )}
    </Chart>
  );
}

/**
 * Both dates draw a span. Only one draws a short block at that date rather than
 * nothing — the date is still information, and a missing counterpart should not
 * erase the task from the timeline.
 */
function barStyle(task: Task, pct: (day: number) => number) {
  const start = task.startDate ? toDay(task.startDate) : null;
  const end = task.dueDate ? toDay(task.dueDate) : null;
  if (start !== null && end !== null && end > start) {
    return { left: `${pct(start)}%`, width: `${Math.max(0.8, pct(end) - pct(start))}%` };
  }
  const at = (end ?? start)!;
  return { left: `${pct(at)}%`, width: "0.8%" };
}

const LABEL_WIDTH = "180px";

const Chart = styled.div`
  display: flex;
  flex-direction: column;
  padding: 4px 0;
`;

const Empty = styled.p`
  padding: 18px 0;
  color: var(--text-faint);
  font-size: 12px;
`;

const Axis = styled.div`
  position: relative;
  height: 18px;
  margin-left: ${LABEL_WIDTH};
  border-bottom: 1px solid var(--border);
`;

const Tick = styled.span`
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  color: var(--text-faint);
  font-size: 10px;
  white-space: nowrap;
`;

const TodayLine = styled.span`
  position: absolute;
  top: 14px;
  bottom: -2000px;
  width: 1px;
  background: var(--warn-soft);
`;

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const GroupHead = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: ${LABEL_WIDTH};
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;

  &:hover {
    color: var(--accent);
  }
`;

const PlainHead = styled.span`
  width: ${LABEL_WIDTH};
  flex-shrink: 0;
  color: var(--text-faint);
  font-size: 13px;
  font-weight: 700;
`;

const GroupName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const GroupCount = styled.span`
  color: var(--text-faint);
  font-size: 11px;
  font-weight: 400;
  flex-shrink: 0;
`;

const Lane = styled.div`
  position: relative;
  height: 20px;
  flex: 1;
  min-width: 0;
`;

const SummaryBar = styled.div`
  position: absolute;
  top: 8px;
  height: 4px;
  border-radius: 999px;
  /* the group's span, behind the individual bars — a hairline of structure,
     not a fill competing with them */
  background: var(--border-strong);
`;

const Diamond = styled.span`
  position: absolute;
  top: 4px;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  transform: rotate(45deg);
  background: var(--milestone);
  border-radius: 2px;

  &[data-status="done"] {
    background: var(--ok);
  }

  &[data-status="planned"] {
    background: transparent;
    border: 2px solid var(--milestone);
  }
`;

const TaskName = styled.button`
  width: ${LABEL_WIDTH};
  flex-shrink: 0;
  padding: 0 0 0 12px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    color: var(--accent);
  }

  &[data-done] {
    color: var(--text-faint);
    text-decoration: line-through;
  }
`;

const Bar = styled.div`
  position: absolute;
  top: 6px;
  height: 8px;
  min-width: 8px;
  border-radius: 999px;
  /* Solid, not the soft tints: a bar on a chart is the content being read,
     and a ten-percent wash of it disappears against a light background. */
  background: var(--accent);

  &[data-status="done"] {
    background: var(--ok);
  }

  &[data-status="todo"] {
    background: var(--border-strong);
  }
`;
