"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styled from "@emotion/styled";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

const NAV_ITEMS = [
  { label: "About", href: "/about" },
  { label: "Members", href: "/members" },
  { label: "Mobi:ON", href: "/mobion" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "#" },
];

export default function Header() {
  const barRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  // 마그네틱 인터랙션: 요소가 커서 쪽으로 부드럽게 끌림
  useGSAP(
    () => {
      const bar = barRef.current;
      if (!bar) return;
      if (
        window.matchMedia("(hover: none)").matches ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }

      const els = bar.querySelectorAll<HTMLElement>("[data-magnetic]");
      const cleanups: Array<() => void> = [];
      const STRENGTH = 0.4;

      els.forEach((el) => {
        const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
        const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });

        const move = (e: MouseEvent) => {
          const r = el.getBoundingClientRect();
          xTo((e.clientX - (r.left + r.width / 2)) * STRENGTH);
          yTo((e.clientY - (r.top + r.height / 2)) * STRENGTH);
        };
        const reset = () => {
          xTo(0);
          yTo(0);
        };

        el.addEventListener("mousemove", move);
        el.addEventListener("mouseleave", reset);
        cleanups.push(() => {
          el.removeEventListener("mousemove", move);
          el.removeEventListener("mouseleave", reset);
        });
      });

      return () => cleanups.forEach((c) => c());
    },
    { scope: barRef },
  );

  return (
    <Bar className="mobi-header" ref={barRef}>
      <Link href="/" style={{ textDecoration: "none" }}>
        <Logo data-magnetic>MOBICOM</Logo>
      </Link>
      <Nav>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <NavLink
              key={item.label}
              href={item.href}
              data-magnetic
              data-active={active || undefined}
            >
              {item.label}
            </NavLink>
          );
        })}
      </Nav>
      <LoginButton type="button" data-magnetic>
        <span className="material-symbols-outlined">person</span>
        Login
      </LoginButton>
    </Bar>
  );
}

const Bar = styled.header`
  position: absolute;
  top: 54px;
  left: 50%;
  transform: translateX(-50%);
  width: min(1622px, calc(100% - 72px));
  height: 75px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 38px;
  overflow: hidden;
  border-radius: 45px;
  background: rgba(37, 37, 37, 0.2);
  backdrop-filter: blur(4px) saturate(140%);
  -webkit-backdrop-filter: blur(4px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35),
    inset 0 1px 1px rgba(255, 255, 255, 0.25),
    inset 0 -1px 1px rgba(0, 0, 0, 0.35);
  z-index: 20;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.18),
      rgba(255, 255, 255, 0.02) 35%,
      rgba(0, 0, 0, 0.08) 100%
    );
    pointer-events: none;
  }
`;

const Logo = styled.div`
  position: relative;
  z-index: 1;
  font-family: "NeoDunggeunmo Pro", "Pretendard Variable", monospace;
  font-weight: 400;
  font-size: 38px;
  color: #fff;
  user-select: none;
`;

const Nav = styled.nav`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
  display: flex;
  align-items: center;
  gap: clamp(25px, 3.6vw, 73px);
`;

const NavLink = styled(Link)`
  position: relative;
  font-size: 22px;
  font-weight: 400;
  color: #fff;
  white-space: nowrap;
  text-decoration: none;
  transition: color 0.2s ease, opacity 0.2s ease;
  opacity: 0.92;

  &:hover {
    color: #00b5ff;
    opacity: 1;
  }

  /* 현재 페이지 표시 — 하단 파란 점 */
  &[data-active] {
    color: #00b5ff;
    opacity: 1;
  }
  &[data-active]::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -9px;
    width: 4.5px;
    height: 4.5px;
    border-radius: 50%;
    background: #00b5ff;
    transform: translateX(-50%);
    box-shadow: 0 0 6px rgba(0, 181, 255, 0.8);
  }
`;

const LoginButton = styled.button`
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  transition: color 0.2s ease;

  .material-symbols-outlined {
    font-size: 22px;
  }

  &:hover {
    color: #00b5ff;
  }
`;
