"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mobion/auth/me")
      .then((res) => res.json())
      .then((data) => setUserName(data.user?.name ?? null))
      .catch(() => setUserName(null));
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/mobion/auth/logout", { method: "POST" });
    setUserName(null);
    router.push("/");
    router.refresh();
  }

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
        const strength = Number(el.dataset.magnetic) || STRENGTH;
        const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
        const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });

        const move = (e: MouseEvent) => {
          const r = el.getBoundingClientRect();
          xTo((e.clientX - (r.left + r.width / 2)) * strength);
          yTo((e.clientY - (r.top + r.height / 2)) * strength);
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
        <Logo data-magnetic="0.18">MOBICOM</Logo>
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
      {userName ? (
        <UserActions>
          <Link href="/profile" style={{ textDecoration: "none" }}>
            <LoginButton type="button" data-magnetic>
              <span className="material-symbols-outlined">person</span>
              {userName}
            </LoginButton>
          </Link>
          <LogoutButton type="button" onClick={handleLogout} aria-label="로그아웃">
            <span className="material-symbols-outlined">logout</span>
          </LogoutButton>
        </UserActions>
      ) : (
        <Link href="/login" style={{ textDecoration: "none" }}>
          <LoginButton type="button" data-magnetic>
            <span className="material-symbols-outlined">person</span>
            Login
          </LoginButton>
        </Link>
      )}
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

  @media (max-width: 760px) {
    top: 55px;
    width: calc(100% - 40px);
    height: 74px;
    padding: 0 26px;
  }

  @media (max-width: 430px) {
    width: calc(100% - 32px);
    height: 72px;
    padding: 0 18px;
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

  @media (max-width: 760px) {
    font-size: 31px;
  }

  @media (max-width: 430px) {
    font-size: 28px;
  }
`;

const Nav = styled.nav`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
  display: flex;
  align-items: center;
  gap: clamp(25px, 3.6vw, 73px);

  @media (max-width: 760px) {
    display: none;
  }
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
  gap: 8px;
  padding: 10px 22px;
  border-radius: 90px;
  border: 1px solid #00b5ff;
  background: linear-gradient(90deg, #004460 0%, #000000 100%);
  font-size: 16px;
  font-weight: 600;
  color: #00b5ff;
  transition: transform 0.25s ease, box-shadow 0.25s ease;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 7px 25px rgba(0, 181, 255, 0.35);
  }

  @media (max-width: 760px) {
    padding: 8px 16px;
    font-size: 14px;

    .material-symbols-outlined {
      font-size: 16px;
    }
  }

  @media (max-width: 430px) {
    padding: 7px 14px;
    font-size: 13px;
  }
`;

const UserActions = styled.div`
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

const LogoutButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: #9a9a9a;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover {
    color: #ff6767;
    border-color: #ff6767;
  }
`;
