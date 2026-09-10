"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCloseOnEscape, useModalEnterAnimation } from "@/lib/use-modal-enter-animation";

gsap.registerPlugin(ScrollTrigger);

type Member = {
  first: string;
  last: string;
  year?: string;
  img?: string;
  leader?: boolean;
  // Modal-only intro. All optional and unfilled for now — a member with
  // nothing set just gets a shorter modal, same as `year`/`img` already do
  // on the card itself.
  projects?: string[];
  languages?: string[];
  interests?: string[];
  certifications?: string[];
};

const MEMBERS: Member[] = [
  { first: "Yunseo", last: "Kang", year: "Junior", img: "/members/yoonseo.png", leader: true },
  { first: "Eunsik", last: "Woo", year: "Junior", img: "/members/eunsik.png" },
  { first: "Daeun", last: "Ye", year: "Junior" },
  { first: "Hajin", last: "Oh", year: "Sophomore", img: "/members/hajin.webp" },
];

// A different shape from Member on purpose — a single faculty profile reads
// as a banner (contact/office/course info), not another grid tile.
type Professor = {
  name: string;
  englishName: string;
  img: string;
  major: string;
  courses: string[];
  phone: string;
  email: string;
  office: string;
  homepage: string;
  // Period + what happened in it. Kept in one string per entry — the source
  // bio itself packs several roles into a single "2007.9-" line, and forcing
  // that into further sub-fields would invent structure that isn't there.
  career: { period: string; desc: string }[];
};

const PROFESSOR: Professor = {
  name: "황경호",
  englishName: "Gyung-Ho Hwang",
  img: "/members/professor.jpeg",
  major: "이동통신네트워크",
  courses: ["이동통신네트워크", "모바일컴퓨팅과응용", "네트워크프로그래밍"],
  phone: "042-821-1751",
  email: "gabriel@hanbat.ac.kr",
  office: "N5동 413호",
  homepage: "https://research.hanbat.ac.kr/mobicom",
  career: [
    {
      period: "1994.3 – 2005.2",
      desc: "KAIST 학사(1998), 석사(2000), 박사(2005, 전자전산학과)",
    },
    { period: "2005 – 2007", desc: "삼성전자 무선사업부 SW책임연구원" },
    {
      period: "2007.9 –",
      desc:
        "국립한밭대학교 컴퓨터공학과 정교수 / " +
        "국립한밭대학교 소프트웨어융합교육원 원장",
    },
  ],
};

export default function MembersContent() {
  const root = useRef<HTMLDivElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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

        <ProfessorSection className="mem-rise">
          <ProfessorPhoto style={{ backgroundImage: `url("${PROFESSOR.img}")` }} />
          <ProfessorInfo>
            <ProfessorName>
              {PROFESSOR.name}
              <ProfessorNameEn>{PROFESSOR.englishName}</ProfessorNameEn>
            </ProfessorName>
            <InfoGrid>
              <InfoRow>
                <InfoLabel>전공분야</InfoLabel>
                <InfoValue>{PROFESSOR.major}</InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>관련교과목</InfoLabel>
                <InfoValue>{PROFESSOR.courses.join(", ")}</InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>전화번호</InfoLabel>
                <InfoValue>
                  <a href={`tel:${PROFESSOR.phone}`}>{PROFESSOR.phone}</a>
                </InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>이메일</InfoLabel>
                <InfoValue>
                  <a href={`mailto:${PROFESSOR.email}`}>{PROFESSOR.email}</a>
                </InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>연구실</InfoLabel>
                <InfoValue>{PROFESSOR.office}</InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>홈페이지</InfoLabel>
                <InfoValue>
                  <a href={PROFESSOR.homepage} target="_blank" rel="noreferrer">
                    {PROFESSOR.homepage}
                  </a>
                </InfoValue>
              </InfoRow>
            </InfoGrid>
            <CareerSection>
              <InfoLabel>경력</InfoLabel>
              <CareerList>
                {PROFESSOR.career.map((c) => (
                  <CareerItem key={c.period}>
                    <CareerPeriod>{c.period}</CareerPeriod>
                    <span>{c.desc}</span>
                  </CareerItem>
                ))}
              </CareerList>
            </CareerSection>
          </ProfessorInfo>
        </ProfessorSection>

        <SubHead className="mem-rise">
          <SubTitle>Members</SubTitle>
          <Divider />
        </SubHead>
        <Grid className="mem-grid">
          {MEMBERS.map((m, i) => (
            <MemberCard key={i} member={m} onOpen={() => setOpenIndex(i)} />
          ))}
        </Grid>
      </Container>
      {openIndex !== null && (
        <MemberModal member={MEMBERS[openIndex]} onClose={() => setOpenIndex(null)} />
      )}
    </Root>
  );
}

function MemberCard({ member: m, onOpen }: { member: Member; onOpen: () => void }) {
  return (
    <Card
      className="mem-card"
      data-cursor="hover"
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`${m.first} ${m.last} 소개 보기`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {m.img && <CardImg style={{ backgroundImage: `url("${m.img}")` }} />}
      <Overlay data-has-img={m.img ? "" : undefined} />
      <Name>
        <span>{m.first}</span>
        <span>{m.last}</span>
      </Name>
      {m.year && <YearTag>{m.year}</YearTag>}
      {m.leader && <LeaderBar>Laboratory Leader</LeaderBar>}
    </Card>
  );
}

function MemberModal({ member: m, onClose }: { member: Member; onClose: () => void }) {
  const { overlayRef, cardRef, close } = useModalEnterAnimation(onClose);
  useCloseOnEscape(close);

  const tagSections = [
    { label: "주 사용 언어", items: m.languages },
    { label: "관심 분야", items: m.interests },
    { label: "자격증", items: m.certifications },
  ].filter((s): s is { label: string; items: string[] } => !!s.items?.length);

  const hasIntro = !!m.projects?.length || tagSections.length > 0;

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={close}>
      <ModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <CloseBtn onClick={close} aria-label="닫기" data-cursor="hover">
          <span className="material-symbols-outlined">close</span>
        </CloseBtn>

        <ModalHead>
          {m.img && <ModalImg style={{ backgroundImage: `url("${m.img}")` }} />}
          <ModalHeadText>
            <ModalName>
              {m.first} {m.last}
            </ModalName>
            <ModalMeta>
              {m.year && <MetaTag>{m.year}</MetaTag>}
              {m.leader && <MetaTag data-leader>Laboratory Leader</MetaTag>}
            </ModalMeta>
          </ModalHeadText>
        </ModalHead>

        {hasIntro ? (
          <ModalBody>
            {m.projects?.length ? (
              <Section>
                <SectionLabel>주요 프로젝트</SectionLabel>
                <ProjectList>
                  {m.projects.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ProjectList>
              </Section>
            ) : null}
            {tagSections.map((s) => (
              <Section key={s.label}>
                <SectionLabel>{s.label}</SectionLabel>
                <TagRow>
                  {s.items.map((item) => (
                    <Tag key={item}>{item}</Tag>
                  ))}
                </TagRow>
              </Section>
            ))}
          </ModalBody>
        ) : (
          <Empty>아직 준비 중인 소개입니다.</Empty>
        )}
      </ModalCard>
    </ModalOverlay>,
    document.body,
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  padding: clamp(160px, 18vh, 220px) 0 98px;
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

const ProfessorSection = styled.div`
  margin-top: clamp(38px, 4.8vh, 72px);
  display: flex;
  gap: clamp(32px, 3.6vw, 56px);

  @media (max-width: 720px) {
    flex-direction: column;
  }
`;

const ProfessorPhoto = styled.div`
  flex: none;
  width: clamp(200px, 22vw, 300px);
  aspect-ratio: 4 / 3;
  border-radius: 8px 8px 31px 8px;
  background-size: cover;
  background-position: center;
  background-color: #2b2300;
`;

const ProfessorInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: clamp(14px, 2vh, 20px);
  padding-top: 4px;
`;

const ProfessorName = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 700;
  font-size: clamp(24px, 2.6vw, 34px);
  color: #fff;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: clamp(10px, 1.6vh, 16px) clamp(20px, 2.4vw, 40px);

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const InfoRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.div`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 600;
  font-size: clamp(11px, 1vw, 13px);
  color: #00b5ff;
`;

const InfoValue = styled.div`
  font-size: clamp(13px, 1.15vw, 16px);
  color: #fff;
  word-break: break-word;

  a {
    transition: color 0.2s ease;
  }

  a:hover {
    color: #00b5ff;
  }
`;

const ProfessorNameEn = styled.span`
  font-weight: 300;
  font-size: clamp(14px, 1.4vw, 19px);
  color: #b0b0b0;
`;

const CareerSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const CareerList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const CareerItem = styled.li`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  color: #fff;
  font-size: clamp(13px, 1.1vw, 15px);
  line-height: 1.5;
`;

const CareerPeriod = styled.span`
  flex: none;
  color: rgba(255, 255, 255, 0.5);
  font-variant-numeric: tabular-nums;
`;

const SubHead = styled.div`
  margin-top: clamp(48px, 6vh, 88px);
  display: flex;
  align-items: flex-end;
  gap: 22px;
`;

const SubTitle = styled.h2`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 800;
  font-size: clamp(22px, 2.6vw, 32px);
  color: #fff;
  white-space: nowrap;
`;

const Grid = styled.div`
  margin-top: clamp(16px, 2vh, 28px);
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

const Card = styled.div`
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 8px 8px 31px 8px;
  overflow: hidden;
  cursor: pointer;
  background: #2b2300;
  transition: transform 0.35s ease, box-shadow 0.35s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 18px 38px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 181, 255, 0.3);
  }

  &:focus-visible {
    outline: 2px solid #00b5ff;
    outline-offset: 4px;
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
  right: clamp(16px, 1.55vw, 24px);
  padding: 6px 16px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #fff;
  font-weight: 600;
  font-size: clamp(12px, 1.15vw, 17px);
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

// ------------------------------------------------------------------
// Modal — same dark/cyan language as the cards, not the app workspace's
// themed ModalCard (that one follows the light/dark toggle; this page
// never does, so it borrows only the behaviour — focus trap, escape,
// enter/exit tween — from use-modal-enter-animation, not its styling).
// ------------------------------------------------------------------

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.7);
`;

const ModalCard = styled.div`
  position: relative;
  width: min(480px, 100%);
  max-height: min(640px, 85vh);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: clamp(20px, 3vh, 28px);
  padding: clamp(28px, 3.6vw, 40px);
  border-radius: 8px 8px 31px 8px;
  background: linear-gradient(180deg, #1b1b1b 0%, #0a0a0a 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 30px 70px rgba(0, 0, 0, 0.55);
`;

const CloseBtn = styled.button`
  position: absolute;
  top: clamp(16px, 2vw, 22px);
  right: clamp(16px, 2vw, 22px);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  transition: border-color 0.2s ease, color 0.2s ease;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover {
    border-color: #00b5ff;
    color: #00b5ff;
  }
`;

const ModalHead = styled.div`
  display: flex;
  align-items: center;
  gap: clamp(16px, 2vw, 22px);
`;

const ModalImg = styled.div`
  flex: none;
  width: clamp(64px, 7vw, 84px);
  height: clamp(64px, 7vw, 84px);
  border-radius: 6px 6px 18px 6px;
  background-size: cover;
  background-position: center;
`;

const ModalHeadText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ModalName = styled.div`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 700;
  font-size: clamp(22px, 2.4vw, 30px);
  color: #fff;
`;

const ModalMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const MetaTag = styled.span`
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  font-size: clamp(11px, 1vw, 13px);
  font-weight: 600;

  &[data-leader] {
    border-color: #00b5ff;
    color: #00b5ff;
  }
`;

const ModalBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: clamp(16px, 2.2vh, 22px);
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionLabel = styled.div`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 600;
  font-size: clamp(12px, 1.1vw, 14px);
  color: #00b5ff;
`;

const ProjectList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 6px;

  li {
    position: relative;
    padding-left: 16px;
    color: #fff;
    font-size: clamp(13px, 1.15vw, 16px);
    line-height: 1.4;
  }

  li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.65em;
    width: 8px;
    height: 1px;
    background: #00b5ff;
  }
`;

const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Tag = styled.span`
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: clamp(12px, 1.05vw, 14px);
`;

const Empty = styled.div`
  color: rgba(255, 255, 255, 0.4);
  font-size: clamp(13px, 1.1vw, 15px);
`;
