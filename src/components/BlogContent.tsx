"use client";

import { useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import type { Post, BlogAuthor } from "@/lib/blog";
import { AUTHORS } from "@/lib/blog";

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
              <CardLink
                key={p.id}
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
            ))}
          </List>
        )}
      </Container>
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  padding: clamp(135px, 14.4vh, 189px) 0 126px;
`;

const Container = styled.div`
  max-width: 1613px;
  margin: 0 auto;
  padding: 0 clamp(22px, 3.6vw, 58px);
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 25px;
`;

const TitleWrap = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 25px;
`;

const Title = styled.h1`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 800;
  font-size: clamp(36px, 4.86vw, 65px);
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
  padding: 13px 31px;
  border: 1.8px solid #fff;
  border-radius: 45px;
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 900;
  font-size: clamp(18px, 1.98vw, 32px);
  color: #fff;
  white-space: nowrap;
`;

const Subtitle = styled.p`
  margin-top: 14px;
  font-weight: 400;
  font-size: clamp(18px, 2.52vw, 40px);
  color: #aeaeae;
`;

const FilterBar = styled.div`
  margin-top: clamp(29px, 3.6vh, 50px);
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  padding: clamp(18px, 1.8vw, 29px);
  background: rgba(0, 0, 0, 0.5);
  border: 1.8px solid #333;
  border-radius: 27px;
`;

const SearchBox = styled.div`
  flex: 1;
  min-width: 216px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 18px;
  height: 58px;
  background: #000;
  border: 1.8px solid #333;
  border-radius: 14px;
  transition: border-color 0.2s ease;

  .material-symbols-outlined {
    color: #a3a3a3;
    font-size: 22px;
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
    font-size: clamp(14px, 1.26vw, 20px);

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
    height: 58px;
    padding: 0 43px 0 20px;
    background: #000;
    border: 1.8px solid #333;
    border-radius: 11px;
    color: #fff;
    font-family: inherit;
    font-size: clamp(14px, 1.17vw, 20px);
    cursor: pointer;
    transition: border-color 0.2s ease;

    &:hover {
      border-color: #555;
    }
  }

  .material-symbols-outlined {
    position: absolute;
    right: 14px;
    color: #a3a3a3;
    font-size: 20px;
    pointer-events: none;
  }
`;

const List = styled.div`
  margin-top: clamp(25px, 2.7vh, 40px);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: clamp(16px, 1.62vw, 25px);

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const CardLink = styled.a`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: clamp(22px, 2.16vw, 32px);
  background: rgba(0, 0, 0, 0.55);
  border: 1.8px solid #333;
  border-radius: 22px;
  transition: transform 0.3s ease, border-color 0.3s ease,
    box-shadow 0.3s ease;

  &:hover {
    transform: translateY(-4px);
    border-color: rgba(0, 181, 255, 0.5);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
  }
`;

const CardTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 11px;
`;

const AuthorChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
  font-size: clamp(12px, 1.08vw, 15px);
`;

const Dot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
`;

const DateText = styled.span`
  font-size: clamp(11px, 0.99vw, 14px);
  color: #8a8a8a;
`;

const CardTitle = styled.h2`
  font-weight: 700;
  font-size: clamp(17px, 1.62vw, 23px);
  line-height: 1.35;
  color: #fff;
`;

const Excerpt = styled.p`
  font-weight: 300;
  font-size: clamp(13px, 1.17vw, 15px);
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
  gap: 7px;
  margin-top: auto;
`;

const Tag = styled.span`
  padding: 5px 11px;
  border-radius: 45px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: clamp(11px, 0.99vw, 13px);
  color: #c0c0c0;
`;

const Arrow = styled.span`
  position: absolute;
  top: clamp(22px, 2.16vw, 32px);
  right: clamp(22px, 2.16vw, 32px);
  color: #555;
  font-size: 20px;
  transition: color 0.3s ease, transform 0.3s ease;

  ${CardLink}:hover & {
    color: #00b5ff;
    transform: translate(2px, -2px);
  }
`;

const Empty = styled.div`
  margin-top: 54px;
  padding: 72px 18px;
  text-align: center;
  color: #8a8a8a;
  font-size: clamp(14px, 1.44vw, 20px);
  border: 1.8px dashed #333;
  border-radius: 22px;
`;
