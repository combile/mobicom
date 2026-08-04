"use client";

import { useRef } from "react";
import styled from "@emotion/styled";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import Laptop from "./Laptop";
import { READY_EVENT } from "./Preloader";
import { SCREEN_ON } from "./TerminalTyping";

gsap.registerPlugin(ScrambleTextPlugin);

// 스크램블에 사용할 랜덤 문자 (#@ 등 글리치 느낌)
const SCRAMBLE_CHARS = "!<>-_\\/[]{}=+*^?#@%&01";

export default function Hero() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (reduceMotion) {
        gsap.set(
          [
            ".mobi-header",
            ".mobi-laptop",
            ".laptop-lid",
            ".screen-content",
            ".hero-line",
            ".word-mobile",
            ".word-computing",
          ],
          { clearProps: "all" },
        );
        return;
      }

      // 노트북 화면(뚜껑)은 접힌 상태에서 시작 (-90°는 통과하지 않도록 -80에서 시작)
      gsap.set(".laptop-lid", {
        rotationX: -80,
        transformOrigin: "bottom center",
        transformPerspective: 1600,
      });
      // 펼쳐지는 동안엔 화면을 꺼둠(검정), 다 펴진 뒤 점등
      gsap.set(".screen-content", { autoAlpha: 0 });
      // 텍스트는 처음엔 숨겨두었다가 스크램블과 함께 등장
      gsap.set([".word-mobile", ".word-computing"], { autoAlpha: 0 });

      // 프리로더가 끝난 뒤(READY_EVENT) 재생 시작
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        paused: true,
      });

      tl
        // 헤더 슬라이드 다운 (Hero 스코프 밖에 있어 DOM 엘리먼트로 직접 지정)
        .from(document.querySelector(".mobi-header"), {
          y: -40,
          autoAlpha: 0,
          duration: 0.8,
        })
        // 노트북 본체 등장
        .from(
          ".mobi-laptop",
          { y: 70, scale: 0.94, autoAlpha: 0, duration: 0.7 },
          "-=0.3",
        )
        // 베이스(키보드) 먼저 살짝 자리잡기
        .from(
          ".laptop-base",
          { scaleX: 0.8, autoAlpha: 0, duration: 0.5 },
          "-=0.3",
        )
        // 뚜껑이 부드럽게 펼쳐짐 (오버슈트 없이 0°에서 정지)
        .to(
          ".laptop-lid",
          {
            rotationX: 0,
            duration: 1.1,
            ease: "power3.out",
          },
          "-=0.05",
        )
        // 다 펴진 뒤 화면 점등(콘텐츠 페이드 인) → 터미널 타이핑 시작
        .to(
          ".screen-content",
          {
            autoAlpha: 1,
            duration: 0.45,
            ease: "power2.out",
            onComplete: () => window.dispatchEvent(new Event(SCREEN_ON)),
          },
          "-=0.35",
        )
        // 가운데 연결선이 중앙에서 양쪽으로 뻗어나감
        .from(
          ".hero-line",
          { scaleX: 0, autoAlpha: 0, duration: 0.9, transformOrigin: "center" },
          "-=0.3",
        )
        // 텍스트를 드러내고 동시에 스크램블 디코드 시작
        .set([".word-mobile", ".word-computing"], { autoAlpha: 1 }, "<0.2")
        // Mobile: 랜덤 문자(#@%&)가 지직거리다 글자로 정착
        .to(
          ".word-mobile",
          {
            duration: 1.3,
            ease: "none",
            scrambleText: {
              text: "Mobile",
              chars: SCRAMBLE_CHARS,
              speed: 0.5,
              revealDelay: 0.3,
            },
          },
          "<",
        )
        // Computing: 동일한 스크램블 디코드 (글자 수가 많아 조금 더 길게)
        .to(
          ".word-computing",
          {
            duration: 1.6,
            ease: "none",
            scrambleText: {
              text: "Computing",
              chars: SCRAMBLE_CHARS,
              speed: 0.5,
              revealDelay: 0.3,
            },
          },
          "<",
        );

      // idle 상태에서는 별도 애니메이션 없음

      // 프리로더 완료 신호를 받으면 진입 시퀀스 재생
      const onReady = () => tl.play();
      window.addEventListener(READY_EVENT, onReady, { once: true });
      return () => window.removeEventListener(READY_EVENT, onReady);
    },
    { scope: root },
  );

  return (
    <Section ref={root}>
      <Line className="hero-line" />
      <Word className="word-mobile" data-side="left">
        Mobile
      </Word>
      <LaptopHolder>
        <Laptop />
      </LaptopHolder>
      <Word className="word-computing" data-side="right">
        Computing
      </Word>
    </Section>
  );
}

const Section = styled.div`
  position: relative;
  width: 100%;
  max-width: 1920px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 108px 36px 0;
`;

const LaptopHolder = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;
`;

const Line = styled.div`
  position: absolute;
  top: 50%;
  /* Mobile/Computing 글자 수 차이로 인해 중앙보다 살짝 왼쪽(Mobile 쪽)으로 이동 */
  left: calc(50% - 4.8vw);
  transform: translateX(-50%) translateY(-50%);
  width: min(853px, 63vw);
  height: 1px;
  background: linear-gradient(90deg, #fff 0%, #999 100%);
  z-index: 1;
`;

const Word = styled.div`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 100;
  font-size: clamp(40px, 6.5vw, 96px);
  line-height: 1.25;
  white-space: nowrap;
  background: linear-gradient(180deg, #ffffff 0%, #8f8f8f 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  z-index: 5;

  &[data-side="left"] {
    left: clamp(24px, 4vw, 73px);
  }

  &[data-side="right"] {
    right: clamp(24px, 4vw, 73px);
  }
`;
