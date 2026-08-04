"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

// 마우스 위치 기반 3D 틸트 (호버 시 카드가 커서 쪽으로 살짝 기울어짐)
export function useTilt3D<T extends HTMLElement>(strength = 10) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      window.matchMedia("(hover: none)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    gsap.set(el, { transformPerspective: 800 });
    const rx = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power3" });
    const ry = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power3" });
    const y = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ry(px * strength);
      rx(-py * strength);
    };
    const onEnter = () => y(-5);
    const onLeave = () => {
      rx(0);
      ry(0);
      y(0);
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [strength]);

  return ref;
}
