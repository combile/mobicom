import LoginContent from "@/components/LoginContent";
import styles from "../page.module.css";

export const metadata = {
  title: "로그인 — MOBICOM",
  description: "Mobi:ON 로그인",
};

export default function LoginPage() {
  return (
    <main className={styles.appPage}>
      <div className={styles.appAmbient} aria-hidden />
      <LoginContent />
    </main>
  );
}
