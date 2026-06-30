"use client";

import { useRef } from "react";
import styled from "@emotion/styled";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const CARDS = [
  {
    img: "/about/card-5g.png",
    ko: ["5G 이동통신시스템의", "MAC 프로토콜 연구"],
    en: ["Research on MAC Protocols", "for 5G Mobile Communication Systems"],
  },
  {
    img: "/about/card-bt.png",
    ko: ["블루투스를 활용한", "응용 프로그램 개발"],
    en: ["Development of Bluetooth-Based", "Applications"],
  },
  {
    img: "/about/card-rfid.png",
    ko: ["RFID 시스템의 충돌 방지", "MAC 프로토콜 연구"],
    en: ["Research on Collision-Avoidance", "MAC Protocols for RFID Systems"],
  },
];

export default function AboutContent() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduceMotion) return;

      // 상단 히어로 요소 진입
      gsap.from(".about-rise", {
        y: 40,
        autoAlpha: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
      });

      // 카드: 스크롤 진입 시 스태거 등장
      gsap.from(".about-card", {
        y: 60,
        autoAlpha: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.15,
        scrollTrigger: {
          trigger: ".about-cards",
          start: "top 80%",
        },
      });
    },
    { scope: root },
  );

  return (
    <Root ref={root}>
      <BgImage aria-hidden />

      <Container>
        <Hero>
          <TitleRow className="about-rise">
            <Title>About</Title>
            <Sub>MobiCom</Sub>
          </TitleRow>

          <ContactBtn className="about-rise" type="button" data-cursor="hover">
            <span className="material-symbols-outlined">arrow_outward</span>
            Contact with Us
          </ContactBtn>

          <Desc className="about-rise">
            본 연구실은 강화학습을 활용하여 무선 센서 네트워크와 셀룰러
            이동통신네트워크의 프로토콜 성능 개선을 연구하고, 스마트폰 앱,
            블록체인, 사물인터넷 구현 프로젝트를 수행합니다.
          </Desc>
        </Hero>

        <Section>
          <SectionHead className="about-rise">
            <SectionTitle>대표 연구 분야</SectionTitle>
            <Divider />
            <More href="#">더보기</More>
          </SectionHead>
          <Professor className="about-rise">지도교수 황경호 교수님</Professor>

          <Cards className="about-cards">
            {CARDS.map((card) => (
              <Card key={card.ko[0]} className="about-card" data-cursor="hover">
                <CardBg style={{ backgroundImage: `url("${card.img}")` }} />
                <CardBody>
                  <CardTitle>
                    {card.ko.map((l) => (
                      <span key={l}>{l}</span>
                    ))}
                  </CardTitle>
                  <CardEn>
                    {card.en.map((l) => (
                      <span key={l}>{l}</span>
                    ))}
                  </CardEn>
                </CardBody>
              </Card>
            ))}
          </Cards>
        </Section>
      </Container>
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  padding: clamp(135px, 14.4vh, 189px) 0 108px;
`;

const BgImage = styled.div`
  position: absolute;
  top: 117px;
  left: 0;
  width: 100%;
  height: 432px;
  background-image: url("/about/bg.png");
  background-size: cover;
  background-position: center bottom;
  opacity: 0.1;
  filter: blur(1.8px);
  pointer-events: none;
  z-index: -1;
  mask-image: linear-gradient(180deg, #000 60%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, #000 60%, transparent 100%);
`;

const Container = styled.div`
  max-width: 1613px;
  margin: 0 auto;
  padding: 0 clamp(22px, 3.6vw, 58px);
`;

const Hero = styled.div`
  display: flex;
  flex-direction: column;
  gap: 25px;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 18px;
`;

const Title = styled.h1`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 700;
  font-size: clamp(40px, 5.4vw, 65px);
  color: #fff;
  line-height: 1;
`;

const Sub = styled.span`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 200;
  font-size: clamp(18px, 2.16vw, 29px);
  color: #b0b0b0;
`;

const ContactBtn = styled.button`
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 11px;
  padding: 16px 34px;
  border-radius: 90px;
  border: 1px solid #00b5ff;
  background: linear-gradient(90deg, #004460 0%, #000000 100%);
  color: #00b5ff;
  font-size: clamp(18px, 1.98vw, 29px);
  font-weight: 400;
  transition: transform 0.25s ease, box-shadow 0.25s ease;

  .material-symbols-outlined {
    font-size: 1em;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 7px 25px rgba(0, 181, 255, 0.35);
  }
`;

const Desc = styled.p`
  max-width: 990px;
  margin-top: clamp(11px, 1.62vh, 22px);
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 200;
  font-size: clamp(14px, 1.6vw, 27px);
  line-height: 1.5;
  color: #fff;
`;

const Section = styled.section`
  margin-top: clamp(72px, 10.8vh, 135px);
`;

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  gap: 25px;
`;

const SectionTitle = styled.h2`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 800;
  font-size: clamp(25px, 3.24vw, 43px);
  color: #fff;
  white-space: nowrap;
`;

const Divider = styled.div`
  flex: 1;
  height: 1px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.4),
    rgba(255, 255, 255, 0.08)
  );
`;

const More = styled.a`
  font-weight: 300;
  font-size: clamp(14px, 1.44vw, 22px);
  color: #b3b3b3;
  white-space: nowrap;
  transition: color 0.2s ease;

  &:hover {
    color: #00b5ff;
  }
`;

const Professor = styled.p`
  margin-top: 16px;
  font-weight: 500;
  font-size: clamp(14px, 1.44vw, 22px);
  color: #d4d4d4;
`;

const Cards = styled.div`
  margin-top: clamp(36px, 5.4vh, 72px);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(18px, 2.16vw, 40px);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div`
  position: relative;
  aspect-ratio: 493 / 537;
  border-radius: 45px;
  overflow: hidden;
  background: #000;
  box-shadow: 0 2px 2px rgba(145, 145, 145, 0.25);
  transition: transform 0.35s ease, box-shadow 0.35s ease;

  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 22px 45px rgba(0, 0, 0, 0.55),
      0 0 0 1px rgba(0, 181, 255, 0.3);
  }
`;

const CardBg = styled.div`
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0.5;
  transition: opacity 0.35s ease, transform 0.6s ease;

  ${Card}:hover & {
    opacity: 0.65;
    transform: scale(1.05);
  }
`;

const CardBody = styled.div`
  position: relative;
  z-index: 1;
  padding: clamp(29px, 2.7vw, 43px);
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const CardTitle = styled.div`
  display: flex;
  flex-direction: column;
  font-weight: 600;
  font-size: clamp(20px, 1.98vw, 29px);
  color: #fff;
  line-height: 1.3;
`;

const CardEn = styled.div`
  display: flex;
  flex-direction: column;
  font-weight: 300;
  font-size: clamp(13px, 1.26vw, 19px);
  color: #a3a3a3;
  line-height: 1.4;
`;
