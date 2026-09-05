import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "多租戶中古車商進銷存與收支管理系統",
};

// 2026-08 手機版關鍵修正：整個網站原本沒有明確設定 viewport meta 標籤
// （<meta name="viewport" content="width=device-width, initial-scale=1">）。
// 少了這個標籤，手機瀏覽器不知道這個網頁是有為手機排版設計過的，會退回
// 「當它是一般桌機網頁」的預設行為：先用一個虛擬的寬版面（通常抓
// 980px 左右）畫出整個頁面，再整個縮小塞進手機螢幕——這正是使用者反映
// 「打開頁面還要自己手動縮小畫面才會正常」的根本原因：不是排版真的
// 跑版，是手機瀏覽器一開始就沒有用「這支手機螢幕實際的寬度」去畫面，
// 而是先照桌機寬度畫、再整個縮小，畫面因此顯得「被縮小過、要手動調整」。
// 這裡明確加上 viewport 設定之後，手機瀏覽器會直接用裝置實際寬度渲染，
// 一打開就是正常大小，不用使用者自己再手動縮放。掛在根 layout，全站
// （登入頁／後台／顧客看車頁）都會套用到。
// 2026-08 深入追查「登入頁文字顏色太淺、怎麼改都一樣」：這次額外查到
// 一個很多人不知道的手機瀏覽器行為——Android 上的 Chrome（以及部分手機
// 品牌自帶的瀏覽器）有一個「自動幫深色模式使用者把網頁變暗」的功能
// （Chrome 設定裡叫「自動將網頁調整為深色」）。這個功能只會對「網站自己
// 沒有明確講清楚有沒有處理深色模式」的網頁生效，瀏覽器會自己用演算法去
// 反轉/調整顏色，這個調整是瀏覽器自己黑箱處理的，跟我們自己寫的
// text-black、dark: 這些 CSS 完全是兩回事——這就可以解釋為什麼使用者已經
// 反應「改成純黑之後還是一樣」：不是我改的顏色沒生效，是瀏覽器在我們的
// CSS 之外又自己動了一手，把顏色算成別的。加上這個 colorScheme 設定，
// 等於明確告訴瀏覽器「這個網站自己會處理顏色，不用你自動幫忙調整」，
// 停用這個自動反轉行為，讓畫面顯示的顏色就是我們自己寫的顏色，不會再被
// 瀏覽器悄悄改掉。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
};

// Vercel 伺服器函式偏好部署區域——Supabase 專案是 ap-northeast-1（東京），
// Vercel 沒特別指定的話預設常常是美東（iad1），後台每次載入都要跟資料庫
// 來回好幾次查詢（見 dashboard/page.tsx 的 Promise.all），如果伺服器函式
// 跟資料庫隔了半個地球，這幾次來回累加起來的延遲會很有感、就是「卡」的
// 原因之一。這裡把偏好區域設到東京（hnd1，離 ap-northeast-1 最近、也離
// 台灣近），縮短伺服器函式到資料庫的網路距離。掛在根 layout 影響全站。
export const preferredRegion = "hnd1";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-TW"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
