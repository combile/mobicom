import BlogContent from "@/components/BlogContent";
import { getPosts } from "@/lib/blog";
import styles from "../page.module.css";

export const metadata = {
  title: "Blog — MOBICOM",
  description: "배운 점들을 짧고 선명하게 — velog · hamsik.kr 연동",
};

// 1시간마다 RSS 재검증
export const revalidate = 3600;

export default async function BlogPage() {
  const posts = await getPosts();
  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden />
      <BlogContent posts={posts} />
    </main>
  );
}
