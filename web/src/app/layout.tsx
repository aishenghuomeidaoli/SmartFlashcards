import type { Metadata } from "next";
import Link from "next/link";

import ThemeToggle from "@/components/ThemeToggle";
import { isLoggedIn } from "@/lib/auth";
import "./globals.css";

/** 站点规范地址：canonical / OpenGraph / metadataBase 都用它。自部署必须覆盖，
 *  否则会把搜索引擎指到本地或别人的域名上。 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** 首屏前定主题：用户选过 light/dark 就照用户的，否则（默认 System）解析系统偏好。
 *  「system」只活在这里和 ThemeToggle 里 —— HTML 上的 data-theme 永远只有 dark/light，CSS 因此只需两套变量。
 *  必须阻塞式跑在 body 顶部，否则会闪一帧默认色；catch 里不清空属性，退回服务端写的默认 dark。 */
const THEME_INIT = `(function(){try{var s=localStorage.getItem("theme");var d=s==="light"?"light":s==="dark"?"dark":(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",d);}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "SmartFlashcards — Turn any PDF into review cards",
    template: "%s | SmartFlashcards",
  },
  description:
    "Upload a PDF, extract its content automatically, generate flashcards, and review them with spaced repetition (FSRS). Turn what you already read into long-term memory.",
  keywords: ["flashcards", "spaced repetition", "AI study", "PDF to flashcards", "memory cards", "review schedule"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "SmartFlashcards",
    url: SITE,
    title: "SmartFlashcards — Turn any PDF into review cards",
    description: "Upload a PDF, generate flashcards automatically, and review them with spaced repetition.",
    images: [{ url: `${SITE}/og-image.png`, width: 1200, height: 630, alt: "SmartFlashcards" }],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartFlashcards — Turn any PDF into review cards",
    description: "Upload a PDF, generate flashcards automatically, and review them with spaced repetition.",
    images: [`${SITE}/og-image.png`],
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const loggedIn = await isLoggedIn();

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      {/* ^ data-theme 是服务端默认值（脚本不可用时的兜底），首屏前会被内联脚本按用户选择/系统偏好覆盖 */}
      <body className="min-h-screen">
        {/* 主题初始化：阻塞式内联脚本，跑在首屏渲染前 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <header className="border-b border-line/60">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2.5 font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand">
                <span className="h-3 w-3 rounded-[3px] bg-on-brand" />
              </span>
              SmartFlashcards
            </Link>
            <div className="flex items-center gap-5 text-sm">
              {loggedIn ? (
                // 目前只有"登录"这一件事，登录后还没有可进的页面 —— 所以只给登出入口。
                // 加第一个功能页时，这里替换成它的链接。
                <a href="/logout" className="text-muted hover:text-brand">
                  Sign out
                </a>
              ) : (
                <>
                  <Link href="/#how" className="text-muted hover:text-brand">
                    How it works
                  </Link>
                  <Link
                    href="/login"
                    className="rounded-lg bg-brand px-3.5 py-1.5 font-medium text-on-brand hover:opacity-90"
                  >
                    Sign in
                  </Link>
                </>
              )}
              <ThemeToggle />
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
        <footer className="mx-auto max-w-5xl px-6 py-10 text-sm text-muted">
          SmartFlashcards · Upload a PDF, turn it into flashcards you can actually review
        </footer>
      </body>
    </html>
  );
}
