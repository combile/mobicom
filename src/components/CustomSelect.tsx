"use client";

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";

export type CustomSelectOption = { value: string; label: string };

type CustomSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  fullWidth?: boolean;
  className?: string;
};

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  fullWidth,
  className,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <Root ref={ref} className={className} data-full-width={fullWidth || undefined}>
      <Trigger type="button" onClick={() => setOpen((v) => !v)} data-open={open || undefined}>
        <TriggerLabel>{selected?.label ?? placeholder ?? ""}</TriggerLabel>
        <span className="material-symbols-outlined">expand_more</span>
      </Trigger>
      {open && (
        <Panel role="listbox">
          {options.map((o) => (
            <Option
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-active={o.value === value || undefined}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
              {o.value === value && <span className="material-symbols-outlined">check</span>}
            </Option>
          ))}
        </Panel>
      )}
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  display: inline-block;

  &[data-full-width] {
    display: block;
    width: 100%;
  }
`;

const Trigger = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--surface-sunken);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 18px;
    color: var(--text-faint);
    transition: transform 0.15s ease, color 0.15s ease;
    flex-shrink: 0;
  }

  &:hover {
    border-color: var(--accent);
  }

  &[data-open] .material-symbols-outlined {
    transform: rotate(180deg);
    color: var(--accent);
  }
`;

const TriggerLabel = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Panel = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 100%;
  max-height: 220px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 10px;
  /* Opaque for the same reason the channel menu is: a dropdown opens over the
     rows it is about, and a translucent one lets those rows show through its
     own options. */
  background: var(--surface);
  border: 1px solid var(--border-strong);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.16);
`;

const Option = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;

  .material-symbols-outlined {
    font-size: 16px;
    color: var(--accent);
  }

  &:hover {
    background: var(--surface-hover);
  }

  &[data-active] {
    color: var(--accent);
  }
`;
