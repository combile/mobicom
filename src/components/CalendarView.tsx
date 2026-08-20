"use client";

import { useState } from "react";
import styled from "@emotion/styled";
import type { ScheduleItem } from "@/lib/use-schedule-data";
import { todayISO } from "@/lib/use-tasks-data";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const VISIBLE_PER_DAY = 3;

function ymd(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Month grid with items sitting on their date.
 *
 * A list answers "what is next"; a month answers "how is this month shaped" —
 * which weeks are empty and which are stacked. The bucket view already covers
 * the first question, so this one is deliberately not ordered by urgency.
 */
export default function CalendarView({
  items,
  onOpen,
  onCreate,
  onReschedule,
}: {
  items: ScheduleItem[];
  onOpen: (item: ScheduleItem) => void;
  onCreate: (date: string) => void;
  onReschedule: (item: ScheduleItem, date: string) => void;
}) {
  const today = todayISO();
  // dataTransfer cannot be read during dragover, only on drop, so the item
  // being dragged is held here instead — the cell needs to know whether it is
  // a valid target while the pointer is still over it
  const [dragging, setDragging] = useState<ScheduleItem | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const d = new Date(`${today}T00:00:00`);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const first = new Date(cursor.year, cursor.month, 1);
  const start = new Date(first);
  // back up to the Sunday on or before the 1st so weeks stay aligned
  start.setDate(1 - first.getDay());

  const byDate = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }

  const cells: { date: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: ymd(d), day: d.getDate(), inMonth: d.getMonth() === cursor.month });
  }
  // a sixth row is drawn only when the month actually reaches into it
  const rows = cells.slice(35).some((c) => c.inMonth) ? 6 : 5;
  const shown = cells.slice(0, rows * 7);

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const monthCount = items.filter((i) => {
    const d = new Date(`${i.date}T00:00:00`);
    return d.getFullYear() === cursor.year && d.getMonth() === cursor.month;
  }).length;

  return (
    <Wrap>
      <Toolbar>
        <MonthLabel>
          {cursor.year}년 {cursor.month + 1}월
        </MonthLabel>
        {monthCount > 0 && <MonthCount>{monthCount}건</MonthCount>}
        <Spacer />
        <NavButton type="button" onClick={() => shift(-1)} aria-label="이전 달">
          <span className="material-symbols-outlined">chevron_left</span>
        </NavButton>
        <TodayButton
          type="button"
          onClick={() => {
            const d = new Date(`${today}T00:00:00`);
            setCursor({ year: d.getFullYear(), month: d.getMonth() });
          }}
        >
          오늘
        </TodayButton>
        <NavButton type="button" onClick={() => shift(1)} aria-label="다음 달">
          <span className="material-symbols-outlined">chevron_right</span>
        </NavButton>
      </Toolbar>

      <Grid>
        {WEEKDAYS.map((w, i) => (
          <WeekdayCell key={w} data-weekend={i === 0 || i === 6 || undefined}>
            {w}
          </WeekdayCell>
        ))}

        {shown.map((cell) => {
          const dayItems = byDate.get(cell.date) ?? [];
          const extra = dayItems.length - VISIBLE_PER_DAY;
          return (
            <DayCell
              key={cell.date}
              data-outside={!cell.inMonth || undefined}
              data-over={(over === cell.date && dragging?.date !== cell.date) || undefined}
              onDragOver={(e) => {
                if (!dragging) return;
                // without preventDefault the browser refuses the drop entirely
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOver(cell.date);
              }}
              onDragLeave={() => setOver((d) => (d === cell.date ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragging) onReschedule(dragging, cell.date);
                setDragging(null);
              }}
            >
              <DayNumber data-today={cell.date === today || undefined}>{cell.day}</DayNumber>
              {/* hidden until the cell is under the pointer: 42 always-visible
                  plus signs would be louder than the schedule itself */}
              <AddButton
                type="button"
                onClick={() => onCreate(cell.date)}
                title={`${cell.date}에 일정 추가`}
              >
                <span className="material-symbols-outlined">add</span>
              </AddButton>
              {dayItems.slice(0, VISIBLE_PER_DAY).map((item) => (
                <Entry
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  data-done={item.status === "done" || undefined}
                  data-dragging={
                    (dragging?.kind === item.kind && dragging?.id === item.id) || undefined
                  }
                  /* a contest deadline is the organiser's date, not ours */
                  draggable={item.kind !== "contest"}
                  onDragStart={(e) => {
                    setDragging(item);
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox starts no drag at all without payload
                    e.dataTransfer.setData("text/plain", item.id);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  onClick={() => onOpen(item)}
                  title={
                    item.kind === "contest"
                      ? `${item.title} · ${item.projectName}`
                      : `${item.title} · ${item.projectName} — 끌어서 날짜 변경`
                  }
                >
                  <Dot data-kind={item.kind} />
                  <EntryText>{item.title}</EntryText>
                </Entry>
              ))}
              {/* the count is the useful part, not three more truncated titles */}
              {extra > 0 && <More>+{extra}</More>}
            </DayCell>
          );
        })}
      </Grid>
    </Wrap>
  );
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
`;

const MonthLabel = styled.h2`
  font-size: 15px;
  font-weight: 600;
  color: #f0f0f0;
`;

const MonthCount = styled.span`
  color: #7a7a7a;
  font-size: 12px;
`;

const Spacer = styled.span`
  flex: 1;
`;

const NavButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #8a8a8a;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover {
    background: #2a2a2a;
    color: #d4d4d4;
  }
`;

const TodayButton = styled.button`
  padding: 4px 10px;
  border: 1px solid #333;
  border-radius: 6px;
  background: transparent;
  color: #9a9a9a;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: #d4d4d4;
    border-color: #4a4a4a;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-top: 1px solid #2a2a2a;
  border-left: 1px solid #2a2a2a;
`;

const WeekdayCell = styled.div`
  padding: 6px 8px;
  border-right: 1px solid #2a2a2a;
  border-bottom: 1px solid #2a2a2a;
  color: #7a7a7a;
  font-size: 11px;
  font-weight: 600;

  &[data-weekend] {
    color: #5f5f5f;
  }
`;



const DayNumber = styled.span`
  padding: 1px 5px;
  align-self: flex-start;
  border-radius: 4px;
  color: #8a8a8a;
  font-size: 11px;

  &[data-today] {
    background: #e0e0e0;
    color: #141414;
    font-weight: 700;
  }
`;

const Entry = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 2px 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #c4c4c4;
  font-size: 11px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: #2a2a2a;
  }

  &[data-done] {
    color: #6a6a6a;
    text-decoration: line-through;
  }

  &[draggable="true"] {
    cursor: grab;
  }

  &[data-dragging] {
    opacity: 0.4;
  }
`;

const Dot = styled.span`
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #6a9fd4;

  &[data-kind="milestone"] {
    border-radius: 1px;
    transform: rotate(45deg);
    background: #8b7cf6;
  }

  &[data-kind="contest"] {
    background: #d4a94a;
  }
`;

const EntryText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const More = styled.span`
  padding: 0 4px;
  color: #6a6a6a;
  font-size: 10px;
`;

const DayCell = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 92px;
  padding: 5px 5px 7px;
  border-right: 1px solid #2a2a2a;
  border-bottom: 1px solid #2a2a2a;

  &[data-outside] {
    background: rgba(0, 0, 0, 0.18);
  }

  &[data-over] {
    /* inset so the highlight does not shift the grid by a pixel */
    box-shadow: inset 0 0 0 1px #6a9fd4;
    background: rgba(106, 159, 212, 0.1);
  }

  /* neighbouring months stay visible so weeks read as weeks, just recessed
     enough not to be mistaken for this one. Named children rather than every
     child: a blanket rule also un-hides the add button, which is supposed to
     stay out of sight until the cell is hovered. */
  &[data-outside] ${DayNumber},
  &[data-outside] ${Entry},
  &[data-outside] ${More} {
    opacity: 0.4;
  }
`;

const AddButton = styled.button`
  position: absolute;
  top: 3px;
  right: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #8a8a8a;
  opacity: 0;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 14px;
  }

  ${DayCell}:hover & {
    opacity: 1;
  }

  &:hover,
  &:focus-visible {
    opacity: 1;
    background: #2f2f2f;
    color: #e0e0e0;
  }
`;
