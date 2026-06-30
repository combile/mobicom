"use client";

import { useRef } from "react";
import styled from "@emotion/styled";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type Member = {
  first: string;
  last: string;
  year?: string;
  img?: string;
  leader?: boolean;
  waiting?: boolean;
};

const MEMBERS: Member[] = [
  { first: "YoonSeo", last: "Kang", year: "Junior", img: "/members/yoonseo.png", leader: true },
  { first: "Eunsik", last: "Woo", year: "Junior", img: "/members/eunsik.png" },
  { first: "Daeun", last: "Ye", year: "Junior" },
  { first: "Hajin", last: "Oh", year: "Sophomore", img: "/members/hajin.webp" },
  { first: "Waiting", last: "For You", waiting: true },
  { first: "Waiting", last: "For You", waiting: true },
];

export default function MembersContent() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap.from(".mem-rise", {
        y: 40,
        autoAlpha: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
      });

      gsap.from(".mem-card", {
        y: 60,
        autoAlpha: 0,
        duration: 0.85,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: ".mem-grid", start: "top 85%" },
      });
    },
    { scope: root },
  );

  return (
    <Root ref={root}>
      <Container>
        <Head className="mem-rise">
          <Title>
            Our Laboratory
            <br />
            Member
          </Title>
          <Divider />
        </Head>
        <Lead className="mem-rise">
          모비콤과 함께 모바일 컴퓨팅을 연구하는 사람들입니다.
        </Lead>

        <Grid className="mem-grid">
          {MEMBERS.map((m, i) =>
            m.waiting ? (
              <WaitingCard key={i} className="mem-card" data-cursor="hover">
                <Plus>+</Plus>
                <WaitName>
                  {m.first} {m.last}
                </WaitName>
                <WaitDesc>새로운 부원을 기다립니다</WaitDesc>
              </WaitingCard>
            ) : (
              <Card key={i} className="mem-card" data-cursor="hover">
                {m.img && (
                  <CardImg style={{ backgroundImage: `url("${m.img}")` }} />
                )}
                <Overlay data-has-img={m.img ? "" : undefined} />
                <Name>
                  <span>{m.first}</span>
                  <span>{m.last}</span>
                </Name>
                {m.year && <YearTag>{m.year}</YearTag>}
                {m.leader && <LeaderBar>Laboratory Leader</LeaderBar>}
              </Card>
            ),
          )}
        </Grid>
      </Container>
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  padding: clamp(126px, 13.6vh, 176px) 0 98px;
`;

const Container = styled.div`
  max-width: 1536px;
  margin: 0 auto;
  padding: 0 clamp(20px, 3.2vw, 52px);
`;

const Head = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 31px;
`;

const Title = styled.h1`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 800;
  font-size: clamp(34px, 4.7vw, 60px);
  line-height: 1.1;
  color: #fff;
  white-space: nowrap;
`;

const Divider = styled.div`
  flex: 1;
  height: 1px;
  margin-bottom: 14px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.4),
    rgba(255, 255, 255, 0.06)
  );
`;

const Lead = styled.p`
  margin-top: 17px;
  font-weight: 300;
  font-size: clamp(13px, 1.38vw, 20px);
  color: #b0b0b0;
`;

const Grid = styled.div`
  margin-top: clamp(38px, 4.8vh, 72px);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(16px, 1.55vw, 28px);

  @media (max-width: 1100px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const cardBase = `
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 8px 8px 31px 8px;
  overflow: hidden;
  transition: transform 0.35s ease, box-shadow 0.35s ease;
`;

const Card = styled.div`
  ${cardBase}
  background: #2b2300;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 18px 38px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(0, 181, 255, 0.3);
  }
`;

const CardImg = styled.div`
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  transition: transform 0.6s ease;

  ${Card}:hover & {
    transform: scale(1.06);
  }
`;

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(43, 35, 0, 0.8);
  transition: background 0.35s ease;

  ${Card}:hover &[data-has-img] {
    background: rgba(43, 35, 0, 0.62);
  }
`;

const Name = styled.div`
  position: absolute;
  top: clamp(16px, 1.55vw, 24px);
  left: clamp(16px, 1.55vw, 24px);
  display: flex;
  flex-direction: column;
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 700;
  font-size: clamp(28px, 3.25vw, 52px);
  line-height: 1.05;
  color: #fff;
`;

const YearTag = styled.div`
  position: absolute;
  top: clamp(16px, 1.55vw, 24px);
  right: 0;
  padding: 6px 15px;
  background: #827859;
  color: #fff;
  font-weight: 900;
  font-size: clamp(13px, 1.45vw, 22px);
  white-space: nowrap;
`;

const LeaderBar = styled.div`
  position: absolute;
  left: 0;
  bottom: 0;
  width: 86%;
  padding: clamp(10px, 1.12vw, 16px) clamp(16px, 1.55vw, 24px);
  background: #000;
  color: #fff;
  font-weight: 200;
  font-size: clamp(16px, 1.95vw, 30px);
  white-space: nowrap;
`;

const WaitingCard = styled.div`
  ${cardBase}
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 11px;
  background: rgba(43, 35, 0, 0.55);
  border: 1.3px dashed rgba(255, 255, 255, 0.18);
  text-align: center;
  padding: 19px;

  &:hover {
    transform: translateY(-4px);
    border-color: rgba(0, 181, 255, 0.5);
    box-shadow: 0 18px 38px rgba(0, 0, 0, 0.45);
  }
`;

const Plus = styled.div`
  font-weight: 200;
  font-size: clamp(38px, 4.8vw, 68px);
  line-height: 1;
  color: rgba(255, 255, 255, 0.5);

  ${WaitingCard}:hover & {
    color: #00b5ff;
  }
`;

const WaitName = styled.div`
  font-weight: 700;
  font-size: clamp(20px, 2.4vw, 36px);
  color: #fff;
`;

const WaitDesc = styled.div`
  font-weight: 300;
  font-size: clamp(12px, 1.12vw, 16px);
  color: #9a9a9a;
`;
