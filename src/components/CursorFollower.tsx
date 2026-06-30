"use client";

import { useRef } from "react";
import styled from "@emotion/styled";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

// Figma 디자인 기준 색상/크기
const RING_SIZE = 28;
const DOT_SIZE = 10;
const ACCENT = "#00B5FF";

const Root = styled.div`
  @media (hover: none), (prefers-reduced-motion: reduce) {
    display: none;
  }
`;

// 외곽 글로우 링 — 반투명 파랑→흰 그라데이션 + 파란 드롭섀도
const Ring = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: ${RING_SIZE}px;
  height: ${RING_SIZE}px;
  margin: ${-RING_SIZE / 2}px 0 0 ${-RING_SIZE / 2}px;
  border-radius: 50%;
  background: linear-gradient(
    90deg,
    rgba(0, 181, 255, 0.25) 0%,
    rgba(255, 255, 255, 0.25) 100%
  );
  box-shadow: 0 -2px 8px 0 rgba(0, 181, 255, 0.45);
  pointer-events: none;
  z-index: 9999;
  opacity: 0;
  will-change: transform;
`;

// 중앙 점 — 진한 파랑
const Dot = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: ${DOT_SIZE}px;
  height: ${DOT_SIZE}px;
  margin: ${-DOT_SIZE / 2}px 0 0 ${-DOT_SIZE / 2}px;
  background: ${ACCENT};
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(0, 181, 255, 0.6);
  pointer-events: none;
  z-index: 9999;
  opacity: 0;
  will-change: transform;
`;

const HOVER_SELECTOR = 'a, button, [data-cursor="hover"]';

export default function CursorFollower() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const ring = ringRef.current;
    const dot = dotRef.current;
    if (!ring || !dot) return;

    if (
      window.matchMedia("(hover: none)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    // 기본 OS 커서 숨김
    document.documentElement.style.cursor = "none";

    const mouse = { x: 0, y: 0 };
    const ringPos = { x: 0, y: 0 };
    const dotPos = { x: 0, y: 0 };

    let visible = false;
    let hovering = false;
    const mod = { press: 1 };

    const setRing = gsap.quickSetter(ring, "css");
    const setDot = gsap.quickSetter(dot, "css");

    const clamp = gsap.utils.clamp(0, 0.42);

    const tick = () => {
      // 점: 거의 즉시 따라옴
      dotPos.x += (mouse.x - dotPos.x) * 0.4;
      dotPos.y += (mouse.y - dotPos.y) * 0.4;

      // 링: 살짝 늦게 스프링처럼 따라옴
      ringPos.x += (mouse.x - ringPos.x) * 0.16;
      ringPos.y += (mouse.y - ringPos.y) * 0.16;

      // 속도 기반 squash & stretch
      const dx = mouse.x - ringPos.x;
      const dy = mouse.y - ringPos.y;
      const dist = Math.hypot(dx, dy);
      const stretch = clamp(dist / 90);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const base = (hovering ? 2 : 1) * mod.press;

      setDot({ x: dotPos.x, y: dotPos.y });
      setRing({
        x: ringPos.x,
        y: ringPos.y,
        rotation: angle,
        scaleX: base * (1 + stretch),
        scaleY: base * (1 - stretch * 0.7),
      });
    };

    gsap.ticker.add(tick);

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (!visible) {
        visible = true;
        ringPos.x = dotPos.x = e.clientX;
        ringPos.y = dotPos.y = e.clientY;
        gsap.to([ring, dot], { opacity: 1, duration: 0.3 });
      }
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(HOVER_SELECTOR)) {
        hovering = true;
        gsap.to(ring, {
          opacity: 1,
          duration: 0.3,
          ease: "back.out(3)",
        });
        gsap.to(dot, { scale: 0, duration: 0.25, ease: "back.in(2)" });
      }
    };

    const onOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(HOVER_SELECTOR)) {
        hovering = false;
        gsap.to(dot, { scale: 1, duration: 0.35, ease: "back.out(3)" });
      }
    };

    const onDown = () =>
      gsap.to(mod, { press: 0.75, duration: 0.18, ease: "back.out(4)" });
    const onUp = () =>
      gsap.to(mod, { press: 1, duration: 0.5, ease: "elastic.out(1, 0.4)" });

    const onLeave = () => gsap.to([ring, dot], { opacity: 0, duration: 0.3 });
    const onEnter = () => gsap.to([ring, dot], { opacity: 1, duration: 0.3 });

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);

    return () => {
      gsap.ticker.remove(tick);
      document.documentElement.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
    };
  });

  return (
    <Root aria-hidden>
      <Ring ref={ringRef} />
      <Dot ref={dotRef} />
    </Root>
  );
}
