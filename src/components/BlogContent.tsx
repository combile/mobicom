"use client";

import { useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import type { Post, BlogAuthor } from "@/lib/blog";
import { AUTHORS } from "@/lib/blog";
import { useSpotlight } from "@/lib/useSpotlight";
import { spotlightGlow } from "@/lib/spotlightGlow";

const AUTHOR_COLOR: Record<BlogAuthor, string> = {
  yxxunseo: "#00b5ff",
  hamsik: "#b58cff",
  daeun: "#7ee787",
  hajin: "#ffa657",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

export default function BlogContent({ posts }: { posts: Post[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState<"all" | BlogAuthor>("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = posts.filter((p) => {
      const matchAuthor = author === "all" || p.author === author;
      const matchQuery =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.authorLabel.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q));
      return matchAuthor && matchQuery;
    });
    list = [...list].sort((a, b) => {
      const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      return sort === "newest" ? -diff : diff;
    });
    return list;
  }, [posts, query, author, sort]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(".blog-rise", {
        y: 36,
        autoAlpha: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.1,
      });
    },
    { scope: root },
  );

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const cards = gsap.utils.toArray<HTMLElement>(".blog-card");
      if (cards.length === 0) {
        gsap.fromTo(
          ".blog-empty",
          { y: 22, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.45, ease: "power3.out" },
        );
        return;
      }

      gsap.fromTo(
        cards,
        { y: 30, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.55,
          ease: "power3.out",
          stagger: 0.06,
          overwrite: true,
        },
      );
    },
    { scope: root, dependencies: [filtered] },
  );

  return (
    <Root ref={root}>
      <Container>
        <Head className="blog-rise">
          <TitleWrap>
            <Title>Blog</Title>
            <Divider />
          </TitleWrap>
          <Notes>{filtered.length} Notes</Notes>
        </Head>
        <Subtitle className="blog-rise">
          배운 점들을 짧고, 선명하게 남겨둡니다
        </Subtitle>

        <FilterBar className="blog-rise">
          <SearchBox>
            <span className="material-symbols-outlined">search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="찾으실 내용을 검색하세요"
            />
          </SearchBox>
          <SelectWrap>
            <select
              value={author}
              onChange={(e) =>
                setAuthor(e.target.value as "all" | BlogAuthor)
              }
            >
              <option value="all">전체 작성자</option>
              {AUTHORS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined">unfold_more</span>
          </SelectWrap>
          <SelectWrap>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
            >
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
            </select>
            <span className="material-symbols-outlined">unfold_more</span>
          </SelectWrap>
        </FilterBar>

        {filtered.length === 0 ? (
          <Empty className="blog-empty">
            {posts.length === 0
              ? "글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
              : "검색 결과가 없습니다."}
          </Empty>
        ) : (
          <List>
            {filtered.map((p) => (
              <BlogCard key={p.id} post={p} />
            ))}
          </List>
        )}
      </Container>
    </Root>
  );
}

function BlogCard({ post: p }: { post: Post }) {
  const spotlightRef = useSpotlight<HTMLAnchorElement>();

  return (
    <CardLink
      ref={spotlightRef}
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      className="blog-card"
      data-cursor="hover"
    >
      <CardTop>
        <AuthorChip style={{ color: AUTHOR_COLOR[p.author] }}>
          <Dot style={{ background: AUTHOR_COLOR[p.author] }} />
          {p.authorLabel}
        </AuthorChip>
        <DateText>{formatDate(p.date)}</DateText>
      </CardTop>
      <CardTitle>{p.title}</CardTitle>
      {p.excerpt && <Excerpt>{p.excerpt}</Excerpt>}
      {p.tags.length > 0 && (
        <Tags>
          {p.tags.map((t) => (
            <Tag key={t}>#{t}</Tag>
          ))}
        </Tags>
      )}
      <Arrow className="material-symbols-outlined">arrow_outward</Arrow>
    </CardLink>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  padding: clamp(160px, 18vh, 220px) 0 116px;
`;

const Container = styled.div`
  max-width: 1536px;
  margin: 0 auto;
  padding: 0 clamp(20px, 3.2vw, 52px);
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 22px;
`;

const TitleWrap = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 22px;
`;

const Title = styled.h1`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 800;
  font-size: clamp(34px, 4.5vw, 60px);
  color: #fff;
`;

const Divider = styled.div`
  flex: 1;
  height: 1px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.4),
    rgba(255, 255, 255, 0.06)
  );
`;

const Notes = styled.div`
  flex-shrink: 0;
  padding: 11px 27px;
  border: 1.5px solid #fff;
  border-radius: 38px;
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 900;
  font-size: clamp(16px, 1.8vw, 29px);
  color: #fff;
  white-space: nowrap;
`;

const Subtitle = styled.p`
  margin-top: 12px;
  font-weight: 400;
  font-size: clamp(16px, 2.25vw, 36px);
  color: #aeaeae;
`;

const FilterBar = styled.div`
  margin-top: clamp(25px, 3.2vh, 44px);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: clamp(16px, 1.55vw, 25px);
  background: rgba(0, 0, 0, 0.5);
  border: 1.5px solid #333;
  border-radius: 22px;
`;

const SearchBox = styled.div`
  flex: 1;
  min-width: 196px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 15px;
  height: 52px;
  background: #000;
  border: 1.5px solid #333;
  border-radius: 12px;
  transition: border-color 0.2s ease;

  .material-symbols-outlined {
    color: #a3a3a3;
    font-size: 20px;
  }

  &:focus-within {
    border-color: #00b5ff;
  }

  input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #fff;
    font-family: inherit;
    font-size: clamp(13px, 1.15vw, 18px);

    &::placeholder {
      color: #a3a3a3;
    }
  }
`;

const SelectWrap = styled.div`
  position: relative;
  display: flex;
  align-items: center;

  select {
    appearance: none;
    -webkit-appearance: none;
    height: 52px;
    padding: 0 38px 0 17px;
    background: #000;
    border: 1.5px solid #333;
    border-radius: 10px;
    color: #fff;
    font-family: inherit;
    font-size: clamp(13px, 1.08vw, 18px);
    cursor: pointer;
    transition: border-color 0.2s ease;

    &:hover {
      border-color: #555;
    }
  }

  .material-symbols-outlined {
    position: absolute;
    right: 12px;
    color: #a3a3a3;
    font-size: 18px;
    pointer-events: none;
  }
`;

const List = styled.div`
  margin-top: clamp(22px, 2.4vh, 36px);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: clamp(14px, 1.45vw, 22px);

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const CardLink = styled.a`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: clamp(19px, 1.9vw, 28px);
  background: rgba(0, 0, 0, 0.55);
  border: 1.5px solid #333;
  border-radius: 18px;
  transition: transform 0.3s ease, border-color 0.3s ease,
    box-shadow 0.3s ease;

  &:hover {
    transform: translateY(-3px);
    border-color: rgba(0, 181, 255, 0.5);
    box-shadow: 0 13px 30px rgba(0, 0, 0, 0.5);
  }

  ${spotlightGlow("rgba(0, 181, 255, 0.5)", 240)}
`;

const CardTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

const AuthorChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: clamp(11px, 1vw, 14px);
`;

const Dot = styled.span`
  width: 5px;
  height: 5px;
  border-radius: 50%;
`;

const DateText = styled.span`
  font-size: clamp(10px, 0.9vw, 13px);
  color: #8a8a8a;
`;

const CardTitle = styled.h2`
  font-weight: 700;
  font-size: clamp(15px, 1.45vw, 21px);
  line-height: 1.35;
  color: #fff;
`;

const Excerpt = styled.p`
  font-weight: 300;
  font-size: clamp(12px, 1.05vw, 14px);
  line-height: 1.6;
  color: #a8a8a8;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
`;

const Tag = styled.span`
  padding: 4px 9px;
  border-radius: 36px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: clamp(10px, 0.9vw, 12px);
  color: #c0c0c0;
`;

const Arrow = styled.span`
  position: absolute;
  top: clamp(19px, 1.9vw, 28px);
  right: clamp(19px, 1.9vw, 28px);
  color: #555;
  font-size: 18px;
  transition: color 0.3s ease, transform 0.3s ease;

  ${CardLink}:hover & {
    color: #00b5ff;
    transform: translate(2px, -2px);
  }
`;

const Empty = styled.div`
  margin-top: 48px;
  padding: 62px 16px;
  text-align: center;
  color: #8a8a8a;
  font-size: clamp(13px, 1.3vw, 18px);
  border: 1.5px dashed #333;
  border-radius: 18px;
`;
