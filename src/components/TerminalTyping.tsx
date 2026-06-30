"use client";

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";

export const SCREEN_ON = "mobi:screen-on";

type Line = { type: "cmd" | "out"; text: string; cwd?: string };
type Step = { type: "cmd" | "out" | "clear"; text?: string };

const BASE_CWD = "~/Mobicom";

// 재치있는 시퀀스 — cd는 페이지(디렉터리)로 이동, ls는 페이지 목록
const SEQUENCE: Step[] = [
  { type: "cmd", text: "whoami" },
  { type: "out", text: "mobile_computing_lab" },
  { type: "cmd", text: "ls" },
  { type: "out", text: "About  Members  Mobi:ON  Blog  Contact" },
  { type: "cmd", text: "cd Mobi:ON" },
  { type: "cmd", text: "cat README.md" },
  { type: "out", text: "📱 Mobile  ×  💻 Computing" },
  { type: "cmd", text: "git log --oneline -1" },
  { type: "out", text: "a1b2c3d  build the future, ship today" },
  { type: "cmd", text: "cd .." },
  { type: "cmd", text: "clear" },
  { type: "clear" },
  { type: "cmd", text: "sudo join --us" },
  { type: "out", text: "Welcome aboard 🚀" },
];

function nextCwd(current: string, cmd: string): string {
  if (!cmd.startsWith("cd ")) return current;
  const arg = cmd.slice(3).trim();
  if (arg === "..") return BASE_CWD;
  return `${BASE_CWD}/${arg}`;
}

export default function TerminalTyping() {
  const [lines, setLines] = useState<Line[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const [cwd, setCwd] = useState(BASE_CWD);
  const cwdRef = useRef(BASE_CWD);

  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const wait = (fn: () => void, ms: number) => {
      timeouts.push(setTimeout(fn, ms));
    };

    // 모션 최소화 시: 전체 결과를 즉시 표시
    if (reduce) {
      let c = BASE_CWD;
      const all: Line[] = [];
      for (const s of SEQUENCE) {
        if (s.type === "clear") {
          // 모션 최소화 시에는 정보 보존을 위해 화면을 비우지 않음
          continue;
        }
        if (s.type === "cmd") {
          all.push({ type: "cmd", text: s.text!, cwd: c });
          c = nextCwd(c, s.text!);
        } else {
          all.push({ type: "out", text: s.text! });
        }
      }
      setLines(all);
      setCwd(c);
      return;
    }

    const run = (i: number) => {
      if (i >= SEQUENCE.length) return;
      const step = SEQUENCE[i];

      if (step.type === "clear") {
        setLines([]);
        wait(() => run(i + 1), 350);
        return;
      }

      if (step.type === "out") {
        setLines((l) => [...l, { type: "out", text: step.text! }]);
        wait(() => run(i + 1), 600);
        return;
      }

      // cmd: 글자별 타이핑
      const text = step.text!;
      const promptCwd = cwdRef.current;
      let c = 0;
      setTyping("");
      const typeChar = () => {
        c += 1;
        setTyping(text.slice(0, c));
        if (c < text.length) {
          wait(typeChar, 45 + Math.random() * 45);
        } else {
          wait(() => {
            setLines((l) => [...l, { type: "cmd", text, cwd: promptCwd }]);
            setTyping(null);
            cwdRef.current = nextCwd(cwdRef.current, text);
            setCwd(cwdRef.current);
            wait(() => run(i + 1), 400);
          }, 380);
        }
      };
      wait(typeChar, 250);
    };

    const start = () => run(0);
    window.addEventListener(SCREEN_ON, start, { once: true });

    return () => {
      window.removeEventListener(SCREEN_ON, start);
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <Wrap>
      <Muted>Last login: Tue Jun 23 09:14:10 on ttys000</Muted>
      {lines.map((ln, idx) =>
        ln.type === "cmd" ? (
          <Row key={idx}>
            <Prompt>{ln.cwd}</Prompt>
            <Cmd>{ln.text}</Cmd>
          </Row>
        ) : (
          <Out key={idx}>{ln.text}</Out>
        ),
      )}
      <Row>
        <Prompt>{cwd}</Prompt>
        <Cmd>
          {typing ?? ""}
          <Cursor />
        </Cmd>
      </Row>
    </Wrap>
  );
}

const Wrap = styled.div`
  font-family: "SF Mono", "Menlo", "Consolas", monospace;
  font-size: clamp(8px, 1.05vw, 13px);
  line-height: 1.7;
`;

const Muted = styled.div`
  color: #cfcfcf;
  margin-bottom: 2px;
`;

const Row = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
`;

const Prompt = styled.span`
  display: inline-block;
  padding: 2px 10px;
  border-radius: 50px;
  background: linear-gradient(90deg, #303030 0%, #000 100%);
  color: #00b5ff;
  font-weight: 600;
  white-space: nowrap;
`;

const Cmd = styled.span`
  color: #f2f2f2;
  word-break: break-word;
`;

const Out = styled.div`
  color: #9a9a9a;
  margin-top: 1px;
  word-break: break-word;
`;

const Cursor = styled.span`
  display: inline-block;
  width: 6px;
  height: 1.05em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: #fff;
  animation: blink 1.05s steps(1) infinite;

  @keyframes blink {
    0%,
    50% {
      opacity: 1;
    }
    50.01%,
    100% {
      opacity: 0;
    }
  }
`;
