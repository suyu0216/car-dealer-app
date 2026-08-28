// /inventory 五個展間頁面（品牌簡介／服務項目／現有車輛／我要估車／
// 成交案件）共用的小工具與 UI 元件——LINE 加好友連結、社群圖示、通用
// 裝飾圖示、分類/篩選用的標籤按鈕。刻意不放任何一個頁面專屬的邏輯（例如
// 車輛篩選狀態），只放「好幾個頁面都會用到」的東西，避免每個頁面各自
// 複製貼上一份。沒有 "use client" 也沒有 "use server"——純展示用的
// presentational 元件，被 Server Component 頁面（services/trade-in/sold）
// 直接用沒問題，被 Client Component（cars/home 的互動區塊）當作一般
// import 使用也沒問題。
import type React from "react";

/** LINE 的「加好友」深連結：官方帳號 ID 一律有 `@` 開頭，個人 ID 沒有——
 * 兩種 ID 在 line.me/ti/p/ 這個路徑後面的格式不一樣（個人 ID 前面要多加
 * 一個 `~`），這裡統一判斷，讓官方 LINE／業務個人 LINE 都能點開直接加
 * 好友，不用讓顧客自己手動搜尋 ID。 */
export function lineAddFriendUrl(lineId: string): string {
  const trimmed = lineId.trim();
  return trimmed.startsWith("@")
    ? `https://line.me/ti/p/${trimmed}`
    : `https://line.me/ti/p/~${trimmed}`;
}

/** ============ 按鈕質感系統（2026-08）============
 * 使用者指定參考一份汽車官網按鈕陳列室（黑底、鍍鉻銀、碳纖維紋理、點火
 * 紅的深色賽車風），要求分成「主要行動／次要行動／特色互動／特殊互動」
 * 四種等級、同分類套同一套視覺語言。這裡直接套用參考站台深色賽車風會
 * 跟這個展間既有的白底黑白灰簡約風衝突，改成沿用同一套「材質分層＋
 * 按壓回饋」的邏輯，套進現有配色：黑白灰為主，新增一撮金棕色
 * #BFA074（跟後台「品牌設定」精選評論小卡表單同一個顏色，前後台共用
 * 同一撮「質感金」當作全站唯一的互動強調色，串起品牌識別），當作四階
 * 按鈕統一的 hover／按下回饋色。橘紅色 #E8542D 維持只用在價格／「近期
 * 上架」急迫標籤，四種按鈕都不使用，避免跟原本的用色規則打架；LINE
 * 相關按鈕維持 LINE 官方綠色（品牌規定色），不算進這套四階系統，全站
 * 沒有更動。
 *
 * 四個等級對應（不集中做成共用元件——這幾顆按鈕原本各自的內距/字級因為
 * 使用情境不同本來就不一樣，例如首頁大 CTA 跟篩選抽屜裡的確認鍵不該
 * 一樣大——而是統一套用同一套 hover／active 質感語言，讓「同一等級摸
 * 起來是同一種按鈕」，不強迫外觀尺寸整齊畫一）：
 * - 主要行動：每個頁面/區塊最重要的單一行動（送出表單、立即看車、篩選
 *   條件、篩選抽屜「查看N筆結果」確認鍵）。黑底白字，hover 反轉成白底
 *   黑字＋金棕色光暈邊框，呼應參考站台「鍍鉻掃光」的高級感。
 * - 次要行動：「還有更多可看」的探索型行動（清除篩選、查看更多／看全部
 *   評論／顯示更多這類帶箭頭的文字連結）。白底或純文字，hover 時文字/
 *   邊框轉成金棕色，呼應參考站台次要按鈕「hover 亮起提示色，暗示還有
 *   更多可看」的邏輯。
 * - 特色互動：車輛卡片／熱門車款卡片這類「點了會有驚喜」的探索式卡片，
 *   hover 時浮出一圈柔和的金棕光暈，取代參考站台的「霧面玻璃＋環繞光」
 *   概念。
 * - 特殊互動：所有純圖示的圓形按鈕（放大檢視上一張/下一張/關閉、Modal
 *   關閉、篩選抽屜關閉、社群圖示），hover／按下都會浮出金棕光暈＋縮放
 *   回饋，呼應參考站台「一鍵啟動」的儀式感，只是用金棕光暈取代點火紅。
 */

/** 分類選單／篩選面板裡的單一標籤——選中時黑底白字、未選中時淺灰外框，
 * 是黑白灰主色調裡的導覽元件，刻意不用橘紅色（那個顏色留給價格／「近期
 * 上架」標籤）。2026-08 第四版：跟按鈕系統一起從圓角膠囊（rounded-full）
 * 改成長方形（rounded-sm），呼應使用者參考的長方形黑框按鈕風格。2026-08
 * 第五版：未選中 hover 邊框改成金棕色（見上面「按鈕質感系統」說明），
 * 跟其他「次要行動」按鈕用同一撮強調色。 */
export function CategoryPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "shrink-0 whitespace-nowrap rounded-sm px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-out active:scale-95 " +
        (active
          ? "bg-[#171717] text-white shadow-sm"
          : "border border-[#E5E5E5] bg-white text-[#404040] hover:border-[#BFA074] hover:text-[#171717]")
      }
    >
      {children}
    </button>
  );
}

/** footer「社群媒體傳送門」的單一圖示按鈕——2026-08 加大版：從單薄的
 * 淺灰細框小圓（h-10）改成白底、有陰影厚度感的大圓（h-14），預設是
 * 淺灰圖示＋白底卡片的樣子，hover 時整顆變成黑底白圖示、微微上浮＋陰影
 * 加深，是黑白灰配色系統裡「選中/強調」的同一套語言（跟 CategoryPill
 * 選中時黑底白字是同一個邏輯），質感比原本「只變外框顏色」的版本更明顯、
 * 更有按鈕感，不用各平台自己的品牌色（避免 footer 一排花花綠綠，跟整體
 * 「整潔／有質感」的方向不一致）。2026-08 第五版：「特殊互動」圖示按鈕
 * 家族的一員（見上面「按鈕質感系統」說明），hover 的陰影裡加一圈金棕
 * 色細邊，跟放大檢視/Modal 關閉等其他圓形圖示按鈕用同一撮強調色。 */
export function SocialIcon({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="btn-tex-icon flex h-14 w-14 items-center justify-center rounded-full border border-[#E5E5E5] bg-white text-[#737373] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#171717] hover:bg-[#171717] hover:text-white hover:shadow-[0_0_0_1px_#BFA074,0_10px_20px_-6px_rgba(0,0,0,0.35)] active:scale-90 active:duration-100"
    >
      {children}
    </a>
  );
}

export function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden>
      <path d="M14.5 8.5H16V6.02c-.26-.04-1.16-.12-2.2-.12-2.18 0-3.67 1.34-3.67 3.8V12H7.75v2.77h2.38V22h2.83v-7.23h2.28l.36-2.77h-2.64V9.99c0-.8.22-1.49 1.54-1.49Z" />
    </svg>
  );
}

export function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.1" cy="6.9" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden>
      <path d="M16.5 3.5c.4 2.2 1.8 3.6 4 3.9v2.9c-1.4 0-2.8-.4-4-1.2v6.2c0 3.1-2.5 5.7-5.7 5.7S5.1 18.4 5.1 15.3c0-3 2.3-5.5 5.3-5.7v2.9c-1.4.2-2.4 1.4-2.4 2.8 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9V3.5h2.7Z" />
    </svg>
  );
}

/** 服務項目／品牌價值主張區塊用的通用裝飾圖示——車行填的是自由文字
 * （例如「全額貸款」「品質保證」），系統沒辦法知道對應哪個語意圖示，
 * 這裡準備一組黑白線條風格的通用圖示（盾牌／勳章／扳手／文件／勾選／
 * 標籤），按項目順序輪流套用，純視覺輔助、跟其他圖示一樣不用彩色，
 * 維持整頁黑白灰配色的一致性。 */
export const GENERIC_SHOWCASE_ICONS: Array<() => React.ReactElement> = [
  IconShield,
  IconBadge,
  IconWrench,
  IconDocument,
  IconCheck,
  IconTag,
];

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5 5 6v5.5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6l-7-2.5Z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  );
}

function IconBadge() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M9 13.5 8 20.5l4-2.2 4 2.2-1-7" />
    </svg>
  );
}

function IconWrench() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a3.5 3.5 0 0 0-4.6 4.2L4.5 16.1a1.6 1.6 0 0 0 2.3 2.3l5.6-5.6a3.5 3.5 0 0 0 4.2-4.6l-2.4 2.4-2-2 2.5-2.3Z" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4M9 12.5h6M9 16h6" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.3 12.3 2.6 2.6 4.8-5.4" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.6 3.5H6.5A1 1 0 0 0 5.5 4.5v6.1a1 1 0 0 0 .3.7l8 8a1 1 0 0 0 1.4 0l6.1-6.1a1 1 0 0 0 0-1.4l-8-8a1 1 0 0 0-.7-.3Z" />
      <circle cx="9.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
