export type BlogAuthor = "yxxunseo" | "hamsik" | "daeun" | "hajin";

export type Post = {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  date: string; // ISO string
  author: BlogAuthor;
  authorLabel: string;
  tags: string[];
};

type Source = {
  author: BlogAuthor;
  label: string;
  url: string;
  fallbackUrl?: string;
};

const SOURCES: Source[] = [
  {
    author: "yxxunseo",
    label: "강윤서",
    url: "https://v2.velog.io/rss/@yxxunseo",
  },
  {
    author: "hamsik",
    label: "우은식",
    url: "https://www.hamsik.kr/rss.xml",
    fallbackUrl: "https://www.hamsik.kr/blog",
  },
];

const ENTITY: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([a-f0-9]+);/gi, (_, n) =>
      String.fromCharCode(Number.parseInt(n, 16)),
    )
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITY[m] ?? m);
}

function unwrapCdata(input: string): string {
  return input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function pickAll(block: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const v = decodeEntities(unwrapCdata(m[1]).trim());
    if (v) out.push(v);
  }
  return out;
}

function clean(raw: string): string {
  return decodeEntities(stripTags(unwrapCdata(raw)));
}

function absolutizeUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function parseDate(raw: string): string {
  const normalized = raw.trim();
  const dotted = normalized.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (dotted) {
    const [, y, m, d] = dotted;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
    ).toISOString();
  }

  const parsed = normalized ? new Date(normalized) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString()
    : new Date(0).toISOString();
}

function parseRss(xml: string, source: Source): Post[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return items.map((block, idx) => {
    const title = clean(pick(block, "title")) || "(제목 없음)";
    const url = absolutizeUrl(clean(pick(block, "link")), source.url);
    const pubDate = clean(pick(block, "pubDate"));
    const rawDesc = pick(block, "description");
    const excerpt = clean(rawDesc).slice(0, 160);
    const tags = pickAll(block, "category").slice(0, 4);

    return {
      id: url || `${source.author}-${idx}`,
      title,
      excerpt,
      url,
      date: parseDate(pubDate),
      author: source.author,
      authorLabel: source.label,
      tags,
    };
  });
}

function parseHamsikBlog(html: string, source: Source): Post[] {
  const postBlocks =
    html.match(/<a\b(?=[^>]*\bdata-blog-post=)[\s\S]*?<\/a>/gi) ?? [];

  return postBlocks.map((block, idx) => {
    const href = block.match(/\bhref="([^"]+)"/i)?.[1] ?? "";
    const title = clean(pick(block, "h2")) || "(제목 없음)";
    const excerpt = clean(pick(block, "p")).slice(0, 160);
    const allSpans = Array.from(
      block.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi),
      (m) => clean(m[1]),
    ).filter(Boolean);
    const date = allSpans.at(-1) ?? "";
    const tags = Array.from(
      block.matchAll(
        /<span\b(?=[^>]*\bdata-blog-tag=)[^>]*>([\s\S]*?)<\/span>/gi,
      ),
      (m) => clean(m[1]),
    )
      .filter(Boolean)
      .slice(0, 4);
    const url = absolutizeUrl(href, source.fallbackUrl ?? source.url);

    return {
      id: url || `${source.author}-${idx}`,
      title,
      excerpt,
      url,
      date: parseDate(date),
      author: source.author,
      authorLabel: source.label,
      tags,
    };
  });
}

async function fetchSource(source: Source): Promise<Post[]> {
  try {
    const res = await fetch(source.url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "MOBICOM-Blog/1.0" },
    });
    if (!res.ok) throw new Error(`Failed to fetch ${source.url}`);
    const xml = await res.text();
    return parseRss(xml, source);
  } catch {
    if (source.fallbackUrl) {
      try {
        const res = await fetch(source.fallbackUrl, {
          next: { revalidate: 3600 },
          headers: { "User-Agent": "MOBICOM-Blog/1.0" },
        });
        if (!res.ok) return [];
        const html = await res.text();
        return parseHamsikBlog(html, source);
      } catch {
        return [];
      }
    }
    return [];
  }
}

export async function getPosts(): Promise<Post[]> {
  const results = await Promise.all(SOURCES.map(fetchSource));
  return results
    .flat()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// 작성자 필터 목록 (글이 아직 없는 부원도 포함)
export const AUTHORS: { value: BlogAuthor; label: string }[] = [
  { value: "yxxunseo", label: "강윤서" },
  { value: "hamsik", label: "우은식" },
  { value: "daeun", label: "예다은" },
  { value: "hajin", label: "오하진" },
];
