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
  padding: clamp(135px, 14.4vh, 189px) 0 108px;
`;

const Container = styled.div`
  max-width: 1613px;
  margin: 0 auto;
  padding: 0 clamp(22px, 3.6vw, 58px);
`;

const Head = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 36px;
`;

const Title = styled.h1`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 800;
  font-size: clamp(36px, 5.04vw, 65px);
  line-height: 1.1;
  color: #fff;
  white-space: nowrap;
`;

const Divider = styled.div`
  flex: 1;
  height: 1px;
  margin-bottom: 16px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.4),
    rgba(255, 255, 255, 0.06)
  );
`;

const Lead = styled.p`
  margin-top: 20px;
  font-weight: 300;
  font-size: clamp(14px, 1.53vw, 22px);
  color: #b0b0b0;
`;

const Grid = styled.div`
  margin-top: clamp(43px, 5.4vh, 81px);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(18px, 1.8vw, 32px);

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
  border-radius: 9px 9px 36px 9px;
  overflow: hidden;
  transition: transform 0.35s ease, box-shadow 0.35s ease;
`;

const Card = styled.div`
  ${cardBase}
  background: #2b2300;

  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 22px 45px rgba(0, 0, 0, 0.5),
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
  top: clamp(18px, 1.8vw, 27px);
  left: clamp(18px, 1.8vw, 27px);
  display: flex;
  flex-direction: column;
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 700;
  font-size: clamp(31px, 3.6vw, 58px);
  line-height: 1.05;
  color: #fff;
`;

const YearTag = styled.div`
  position: absolute;
  top: clamp(18px, 1.8vw, 27px);
  right: 0;
  padding: 7px 18px;
  background: #827859;
  color: #fff;
  font-weight: 900;
  font-size: clamp(14px, 1.62vw, 25px);
  white-space: nowrap;
`;

const LeaderBar = styled.div`
  position: absolute;
  left: 0;
  bottom: 0;
  width: 86%;
  padding: clamp(11px, 1.26vw, 18px) clamp(18px, 1.8vw, 27px);
  background: #000;
  color: #fff;
  font-weight: 200;
  font-size: clamp(18px, 2.16vw, 34px);
  white-space: nowrap;
`;

const WaitingCard = styled.div`
  ${cardBase}
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 13px;
  background: rgba(43, 35, 0, 0.55);
  border: 1.5px dashed rgba(255, 255, 255, 0.18);
  text-align: center;
  padding: 22px;

  &:hover {
    transform: translateY(-5px);
    border-color: rgba(0, 181, 255, 0.5);
    box-shadow: 0 22px 45px rgba(0, 0, 0, 0.45);
  }
`;

const Plus = styled.div`
  font-weight: 200;
  font-size: clamp(43px, 5.4vw, 76px);
  line-height: 1;
  color: rgba(255, 255, 255, 0.5);

  ${WaitingCard}:hover & {
    color: #00b5ff;
  }
`;

const WaitName = styled.div`
  font-weight: 700;
  font-size: clamp(22px, 2.7vw, 40px);
  color: #fff;
`;

const WaitDesc = styled.div`
  font-weight: 300;
  font-size: clamp(13px, 1.26vw, 18px);
  color: #9a9a9a;
`;
