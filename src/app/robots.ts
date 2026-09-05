// 2026-09-05 SEO 優化新增：全站原本完全沒有 robots.txt，代表任何搜尋引擎
// 理論上什麼路徑都可以爬——包含 /dashboard（後台管理介面）、/login（登入
// 頁）、/auth（密碼重設等驗證流程）、/super-admin（平台管理員後台）這些
// 完全不該出現在 Google 搜尋結果的內部頁面。這裡明確告訴搜尋引擎只能爬
// /inventory 這組公開看車頁，其餘路徑一律不爬——雖然這些頁面本來就需要
// 登入才看得到實際內容（proxy.ts 的 PROTECTED_PREFIXES 會擋下未登入的
// 請求），但「連網址本身都不該被搜尋引擎收錄」是更保守、更安全的做法：
// 避免車行的後台網址結構、登入頁措辭等內部資訊出現在任何人的 Google
// 搜尋結果裡。
import type { MetadataRoute } from "next";

// 正式網址——優先看 NEXT_PUBLIC_SITE_URL 環境變數（尚未設定時退回目前的
// 正式網域）。跟 site-url.ts 的 getSiteUrl() 不同，這裡刻意不用
// headers()/request context，讓 robots.txt／sitemap.xml 可以被 Next.js
// 當成靜態內容產生，不用每次請求都重新計算。
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://heartease.vercel.app").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/inventory"],
        disallow: ["/dashboard", "/login", "/auth", "/super-admin"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
