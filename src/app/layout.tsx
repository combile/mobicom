import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import EmotionRegistry from "./emotion-registry";
import Header from "@/components/Header";
import CursorFollower from "@/components/CursorFollower";

export const metadata: Metadata = {
  title: "MOBICOM — Mobile Computing",
  description: "Mobile Computing Lab landing page",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /* the inline script below stamps data-theme before React boots, so the
       server markup and the hydrated markup differ here on purpose */
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Runs before the first paint, so a dark-mode user never sees a white
            flash while React boots. Deliberately inline and dependency-free:
            anything imported would arrive too late to prevent it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('mobion-theme');" +
              "if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);" +
              "}catch(e){}})();",
          }}
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/neodgm/neodgm-pro-webfont@latest/neodgm_pro/style.css"
        />
      </head>
      <body>
        <EmotionRegistry>
          <CursorFollower />
          <Header />
          {children}
          <div className="mobi-grain" aria-hidden />
        </EmotionRegistry>
      </body>
    </html>
  );
}
