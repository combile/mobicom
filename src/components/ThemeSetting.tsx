"use client";

import { useEffect, useState } from "react";
import styled from "@emotion/styled";

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "mobion-theme";

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "밝게", icon: "light_mode" },
  { value: "dark", label: "어둡게", icon: "dark_mode" },
  { value: "system", label: "시스템", icon: "contrast" },
];

/**
 * Applies a theme by attribute rather than by rewriting colours.
 *
 * "system" removes the attribute instead of resolving the preference and
 * writing it back: resolved once, the page would keep whatever the OS said at
 * that moment and stop following a later change. Absent, the media query in
 * globals.css keeps answering the question for as long as the page is open.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export default function ThemeSetting() {
  // Starts at "system" and corrects itself after mount. The server cannot know
  // what is in this browser's localStorage, so rendering the stored choice
  // straight away would be a hydration mismatch. The page itself is already
  // painted correctly by the inline script in the layout — this only catches
  // up which button is highlighted.
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") setTheme(stored);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // private browsing and similar: the choice still applies to this page,
      // it just will not be remembered
    }
  }

  return (
    <Field>
      <Label>화면 테마</Label>
      <Switch role="radiogroup" aria-label="화면 테마">
        {OPTIONS.map((o) => (
          <Option
            key={o.value}
            type="button"
            role="radio"
            aria-checked={theme === o.value}
            data-active={theme === o.value || undefined}
            onClick={() => choose(o.value)}
          >
            <span className="material-symbols-outlined">{o.icon}</span>
            {o.label}
          </Option>
        ))}
      </Switch>
    </Field>
  );
}

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.span`
  font-size: 12px;
  color: var(--text-muted);
`;

const Switch = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
`;

const Option = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 7px 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover {
    color: var(--text);
  }

  &[data-active] {
    background: var(--surface-active);
    color: var(--text-strong);
  }
`;
