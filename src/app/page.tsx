import Hero from "@/components/Hero";
import Preloader from "@/components/Preloader";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <Preloader />
      <div className={styles.ambient} aria-hidden />
      <Hero />
    </main>
  );
}
