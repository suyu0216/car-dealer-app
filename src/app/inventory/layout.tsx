import { Noto_Sans_TC } from "next/font/google";

// 顧客前台展間專用的粗黑體——只在 /inventory 這個路由子樹套用，不動到
// /dashboard 後台或全站的 Geist Sans（見根 layout.tsx）。
//
// 原本第一版走「深藍米色 精品藝廊風」用襯線字體（明體），走的是低調、
// 慢慢考慮的精品調性；後來車行反映深色底讓人「不太想買」——這是對的
// 直覺：深色＋襯線字體傳達的是「謹慎評估」。改版後標題／價格一律用
// 粗黑體（900 字重）取代明體的沉靜調性，這個字重選擇後續兩次配色調整
// （見 showroom-page.tsx 開頭「視覺風格」的完整說明：暖白橘紅版 → 黑白灰
// 精品版）都繼續沿用沒有再改——粗黑體本身就很適合黑白灰的雜誌編輯風，
// 不是只有暖色系才搭。只載入標題會用到的兩個字重，避免不必要的字體
// 檔案大小。
const notoSansTC = Noto_Sans_TC({
  variable: "--font-showroom-display",
  subsets: ["latin"],
  weight: ["700", "900"],
});

export default function InventoryLayout({ children }: LayoutProps<"/inventory">) {
  return <div className={`${notoSansTC.variable} font-sans`}>{children}</div>;
}
