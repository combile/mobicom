"use client";

import { useRef } from "react";
import styled from "@emotion/styled";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

export const READY_EVENT = "mobi:loaded";
const VISITED_KEY = "mobi:visited";

export default function Preloader() {
  const root = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      const fireReady = () => window.dispatchEvent(new Event(READY_EVENT));
      const markVisited = () => {
        try {
          sessionStorage.setItem(VISITED_KEY, "1");
        } catch {}
      };

      let visited = false;
      try {
        visited = sessionStorage.getItem(VISITED_KEY) === "1";
      } catch {}

      // 같은 세션에서 재방문했거나 모션 최소화 시 → 프리로더 스킵
      if (visited || reduceMotion) {
        gsap.set(root.current, { display: "none" });
        markVisited();
        // Hero의 READY 리스너 등록 이후 발생하도록 다음 틱에 알림
        const t = setTimeout(fireReady, 0);
        return () => clearTimeout(t);
      }

      const count = { v: 0 };
      const tl = gsap.timeline();

      tl
        // 카운터 0 → 100 + 로딩바 채움
        .to(count, {
          v: 100,
          duration: 1.6,
          ease: "power2.inOut",
          onUpdate: () => {
            if (counterRef.current)
              counterRef.current.textContent = `${Math.round(count.v)}`;
          },
        })
        .to(barRef.current, { scaleX: 1, duration: 1.6, ease: "power2.inOut" }, 0)
        // 중앙 콘텐츠 위로 사라짐
        .to(".pre-center", {
          y: -40,
          autoAlpha: 0,
          duration: 0.5,
          ease: "power3.in",
        })
        // split-door: 위/아래 패널이 갈라지며 메인 노출
        .to(
          ".pre-panel-top",
          { yPercent: -100, duration: 0.9, ease: "power4.inOut" },
          "-=0.1",
        )
        .to(
          ".pre-panel-bottom",
          { yPercent: 100, duration: 0.9, ease: "power4.inOut" },
          "<",
        )
        .set(root.current, { display: "none" })
        .add(() => {
          markVisited();
          fireReady();
        });
    },
    { scope: root },
  );

  return (
    <Root ref={root} aria-hidden>
      <Panel className="pre-panel-top" data-pos="top" />
      <Panel className="pre-panel-bottom" data-pos="bottom" />
      <Center className="pre-center">
        <Logo>MOBICOM</Logo>
        <BarTrack>
          <Bar ref={barRef} />
        </BarTrack>
        <Counter>
          <span ref={counterRef}>0</span>
          <em>%</em>
        </Counter>
      </Center>
    </Root>
  );
}

const Root = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000;
  pointer-events: none;
`;

const Panel = styled.div`
  position: absolute;
  left: 0;
  width: 100%;
  height: 50.5%;
  background: #000;

  &[data-pos="top"] {
    top: 0;
  }
  &[data-pos="bottom"] {
    bottom: 0;
  }
`;

const Center = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
`;

const Logo = styled.div`
  font-family: "NeoDunggeunmo Pro", "Pretendard Variable", monospace;
  font-size: clamp(32px, 5vw, 56px);
  color: #fff;
  letter-spacing: 1px;
`;

const BarTrack = styled.div`
  width: clamp(160px, 22vw, 280px);
  height: 2px;
  background: rgba(255, 255, 255, 0.14);
  border-radius: 2px;
  overflow: hidden;
`;

const Bar = styled.div`
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #00b5ff 0%, #ffffff 100%);
  transform: scaleX(0);
  transform-origin: left center;
  will-change: transform;
`;

const Counter = styled.div`
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-family: "NeoDunggeunmo Pro", "SF Mono", "Menlo", monospace;
  font-size: 18px;
  color: #00b5ff;

  em {
    font-style: normal;
    color: rgba(255, 255, 255, 0.5);
  }
`;
