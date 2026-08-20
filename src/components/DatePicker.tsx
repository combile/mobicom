"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { todayISO } from "@/lib/use-tasks-data";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const POP_WIDTH = 232;
/** tall enough for the six-row month plus header and footer */
const POP_HEIGHT = 272;

function ymd(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Date field with its own calendar.
 *
 * The native control draws its own text layout, spin behaviour and indicator,
 * none of which follow the surrounding panel — it was the last place the UI
 * still looked like a browser default. Typing is deliberately not offered:
 * these values are picked from a month far more often than typed, and a text
 * field accepting exactly one format invites entering another.
 */
export default function DatePicker({
  value,
  onChange,
  placeholder = "날짜 없음",
  block = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** fill the row and carry a visible border, for form fields rather than property rows */
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const today = todayISO();

  const [cursor, setCursor] = useState(() => {
    const base = new Date(`${value || today}T00:00:00`);
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  // opening should land on the month of the current value, not wherever the
  // calendar happened to be left
  useEffect(() => {
    if (!open) return;
    const base = new Date(`${value || today}T00:00:00`);
    setCursor({ year: base.getFullYear(), month: base.getMonth() });
  }, [open, value, today]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      // the calendar lives in a portal, so it is not inside the wrapper
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      // capture, so Escape closes the calendar without also closing the modal
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    // fixed coordinates do not follow a scrolling panel; closing is honest
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const first = new Date(cursor.year, cursor.month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: ymd(d), day: d.getDate(), inMonth: d.getMonth() === cursor.month };
  });
  const rows = cells.slice(35).some((c) => c.inMonth) ? 6 : 5;

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <Wrap ref={wrapRef} data-block={block || undefined}>
      <Trigger
        type="button"
        data-empty={!value || undefined}
        data-block={block || undefined}
        onClick={() => {
          const r = wrapRef.current?.getBoundingClientRect();
          if (r) {
            // flip above the field when the month would not fit below, and
            // keep it inside the viewport on the right-hand edge
            const below = window.innerHeight - r.bottom >= POP_HEIGHT + 8;
            setAt({
              top: below ? r.bottom + 4 : Math.max(8, r.top - POP_HEIGHT - 4),
              left: Math.min(r.left, window.innerWidth - POP_WIDTH - 8),
            });
          }
          setOpen((v) => !v);
        }}
      >
        {value || placeholder}
      </Trigger>

      {/* portalled out: both the task panel and the create modals scroll their
          own content, and an absolutely positioned calendar is clipped by them */}
      {open &&
        createPortal(
          <Pop ref={popRef} style={{ top: at.top, left: at.left }}>
            <PopHead>
              <NavButton type="button" onClick={() => shift(-1)} aria-label="이전 달">
                <span className="material-symbols-outlined">chevron_left</span>
              </NavButton>
              <PopMonth>
                {cursor.year}년 {cursor.month + 1}월
              </PopMonth>
              <NavButton type="button" onClick={() => shift(1)} aria-label="다음 달">
                <span className="material-symbols-outlined">chevron_right</span>
              </NavButton>
            </PopHead>

            <PopGrid>
              {WEEKDAYS.map((w) => (
                <PopWeekday key={w}>{w}</PopWeekday>
              ))}
              {cells.slice(0, rows * 7).map((c) => (
                <PopDay
                  key={c.date}
                  type="button"
                  data-outside={!c.inMonth || undefined}
                  data-today={c.date === today || undefined}
                  data-selected={c.date === value || undefined}
                  onClick={() => {
                    onChange(c.date);
                    setOpen(false);
                  }}
                >
                  {c.day}
                </PopDay>
              ))}
            </PopGrid>

            <PopFoot>
              <PopAction
                type="button"
                onClick={() => {
                  onChange(today);
                  setOpen(false);
                }}
              >
                오늘
              </PopAction>
              {value && (
                <PopAction
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  지우기
                </PopAction>
              )}
            </PopFoot>
          </Pop>,
          document.body,
        )}
    </Wrap>
  );
}

const Wrap = styled.div`
  position: relative;
  display: inline-flex;

  &[data-block] {
    display: flex;
    width: 100%;
  }
`;

const Trigger = styled.button`
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;

  &[data-empty] {
    color: var(--text-faint);
  }

  &[data-block] {
    flex: 1;
    padding: 8px 10px;
    border-color: var(--border-strong);
    border-radius: 6px;
    text-align: left;
  }

  &:hover {
    border-color: var(--border-strong);
  }

  &:focus-visible {
    outline: 1px solid var(--border-strong);
    outline-offset: 1px;
  }
`;

const Pop = styled.div`
  position: fixed;
  /* above ModalOverlay (50) — the picker is used inside the create modals */
  z-index: 70;
  width: ${POP_WIDTH}px;
  padding: 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface-raised);
  box-shadow: var(--shadow-pop);
`;

const PopHead = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
`;

const PopMonth = styled.span`
  flex: 1;
  text-align: center;
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 600;
`;

const NavButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover {
    background: var(--surface-active);
    color: var(--text);
  }
`;

const PopGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
`;

const PopWeekday = styled.span`
  padding-bottom: 4px;
  color: var(--text-faint);
  font-size: 10px;
  text-align: center;
`;

const PopDay = styled.button`
  height: 26px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;

  &[data-outside] {
    color: var(--text-faint);
  }

  &:hover {
    background: var(--surface-active);
  }

  /* today is an outline so it never competes with the actual selection */
  &[data-today] {
    box-shadow: inset 0 0 0 1px var(--border-strong);
  }

  &[data-selected] {
    background: var(--selected-bg);
    color: var(--text-inverse);
    font-weight: 700;
  }
`;

const PopFoot = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-strong);
`;

const PopAction = styled.button`
  padding: 3px 9px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: var(--surface-active);
    color: var(--text);
  }
`;
