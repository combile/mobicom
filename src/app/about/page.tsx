import AboutContent from "@/components/AboutContent";
import styles from "../page.module.css";

export const metadata = {
  title: "About — MOBICOM",
  description: "Mobile Computing Lab 소개",
};

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden />
      <AboutContent />
    </main>
  );
}
