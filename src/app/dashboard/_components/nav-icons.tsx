// 2026-08-31 新增：側邊欄圖示改用手刻的線條 SVG，取代原本的 emoji——
// 安安參考同行 Hocar 車輛管理系統的側邊欄，emoji（📦🛠️👥…）在不同電腦／
// 手機上粗細、顏色都不一樣，看起來比較像隨手貼的符號；改成同一套線條
// 圖示（統一 1.75 描邊、24×24、currentColor），不管在哪裡看都一致，
// 也能跟著文字顏色變化（選中的項目文字變白，圖示也會跟著變白）。
//
// 沒有另外裝圖示套件（例如 lucide-react）：這幾個圖示够簡單，手刻
// 純 SVG 不用多一個 npm 依賴，安裝上也比較省事（不用叫安安在自己電腦
// 上跑 npm install 才能看到效果）。
//
// 每個都是同樣的介面：接受 className（給 sidebar-nav.tsx 控制大小/
// 顏色用），style 統一 fill="none" stroke="currentColor"，方便日後
// 要再加新圖示時照抄同一種寫法。
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  // 預設撐滿父層那個 18×18 的置中容器（見 sidebar-nav.tsx renderLeaf/
  // renderGroup 外層那個 span）——呼叫端（layout.tsx）不用每次都重複
  // 傳 className，沒特別指定大小的話就是這個預設值。個別呼叫端如果有
  // 傳 className（目前沒有），會整個蓋掉這個預設值，不是疊加，這點
  // 呼叫端要注意。
  className: "h-full w-full",
};

/** 2026-09-04 新增：儀表板／總覽——新的側邊欄首頁項目，跟「車輛庫存」
 * 分開，一個房子線條圖示，跟同行 Hocar 系統的「儀表板」圖示概念一致。 */
export function IconHome(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M5.5 9.8V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.8" />
      <path d="M9.7 20v-5.2a1 1 0 0 1 1-1h2.6a1 1 0 0 1 1 1V20" />
    </svg>
  );
}

/** 車輛庫存——一台車的簡化側面線條。 */
export function IconInventory(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 15.5l1.4-4.9A2 2 0 0 1 6.3 9.2h11.4a2 2 0 0 1 1.9 1.4l1.4 4.9" />
      <path d="M3 15.5h18v2.3a1 1 0 0 1-1 1h-1.2a1 1 0 0 1-1-1v-.8H6.2v.8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2.3Z" />
      <circle cx="7.5" cy="15.5" r="1.4" />
      <circle cx="16.5" cy="15.5" r="1.4" />
    </svg>
  );
}

/** 銷售與客戶（群組）——握手／往來。 */
export function IconSales(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10.5l3.2-3.2a1.5 1.5 0 0 1 2.1 0l1.2 1.2" />
      <path d="M21 10.5l-3.2-3.2a1.5 1.5 0 0 0-2.1 0L9.5 13.6a1.5 1.5 0 0 0 0 2.1l.4.4a1.5 1.5 0 0 0 2.1 0" />
      <path d="M13.7 15.8l1.4 1.4a1.4 1.4 0 0 0 2-2l-3.6-3.6" />
      <path d="M3 10.5v3.8a1 1 0 0 0 .3.7l3.3 3.3a1.4 1.4 0 0 0 2 0" />
    </svg>
  );
}

/** 買賣合約——文件＋條列。 */
export function IconDocument(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5v4h4" />
      <path d="M8.5 12h7M8.5 15h7M8.5 18h4" />
    </svg>
  );
}

/** CRM 客戶追蹤——兩個人形。 */
export function IconUsers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 6a3 3 0 0 1 0 6" />
      <path d="M15 13.2c2.3.4 4 1.8 4.5 3.8" />
    </svg>
  );
}

/** 估車申請——一台小車＋放大鏡（估價/查詢）。 */
export function IconCar(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 14l1.1-3.6A1.6 1.6 0 0 1 6.6 9.3h6.8a1.6 1.6 0 0 1 1.5 1.1L16 14" />
      <path d="M4 14h12v1.8a.9.9 0 0 1-.9.9h-.9a.9.9 0 0 1-.9-.9v-.6H6.7v.6a.9.9 0 0 1-.9.9h-.9a.9.9 0 0 1-.9-.9V14Z" />
      <circle cx="7.4" cy="14" r="1.1" />
      <circle cx="12.6" cy="14" r="1.1" />
      <circle cx="18.5" cy="16.5" r="2.5" />
      <path d="M20.3 18.3L22 20" />
    </svg>
  );
}

/** 維修與財務（群組）——扳手。 */
export function IconWrench(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14.7 6.3a3.5 3.5 0 0 0-4.6 4.3L4 16.7a1.8 1.8 0 0 0 2.5 2.5l6.1-6.1a3.5 3.5 0 0 0 4.3-4.6l-2.3 2.3-1.9-.5-.5-1.9 2.5-2.1Z" />
    </svg>
  );
}

/** 業務薪資——錢幣。 */
export function IconWallet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="7" width="18" height="13" rx="1.6" />
      <path d="M3 10.5h18" />
      <path d="M16 14.5h2.2" />
    </svg>
  );
}

/** 公司帳務——公事包。 */
export function IconBriefcase(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="8" width="18" height="11" rx="1.6" />
      <path d="M8.5 8V6.2A1.2 1.2 0 0 1 9.7 5h4.6a1.2 1.2 0 0 1 1.2 1.2V8" />
      <path d="M3 13h18" />
      <path d="M10.5 13v1.4h3V13" />
    </svg>
  );
}

/** 經營數據看板——長條圖。 */
export function IconChart(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20V9.5" />
      <path d="M10 20V4.5" />
      <path d="M16 20v-7" />
      <path d="M2.5 20.5h19" />
    </svg>
  );
}

/** 品牌設定——調色盤。 */
export function IconPalette(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5a8.5 8 0 1 0 0 16c1 0 1.6-.7 1.6-1.5 0-.4-.2-.7-.4-1-.2-.3-.4-.6-.4-1 0-.8.6-1.4 1.4-1.4h1.6c2 0 3.7-1.6 3.7-3.6 0-4-3.5-7.5-7.5-7.5Z" />
      <circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="7.7" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.3" cy="9.3" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 帳號與權限管理／系統設定（群組）——齒輪。 */
export function IconGear(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.8v2M12 18.2v2M20.2 12h-2M5.8 12h-2M17.5 6.5l-1.4 1.4M7.9 16.1l-1.4 1.4M17.5 17.5l-1.4-1.4M7.9 7.9L6.5 6.5" />
    </svg>
  );
}

/** 我的公開聯繫方式——名片。 */
export function IconContact(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="1.6" />
      <circle cx="8.3" cy="12" r="2" />
      <path d="M5.2 16c.5-1.6 1.7-2.4 3.1-2.4s2.6.8 3.1 2.4" />
      <path d="M14.5 9.8h4M14.5 13h4M14.5 16.2h2.6" />
    </svg>
  );
}

/** 展開/收合箭頭——群組項目右側，收合時朝右、展開時朝下（在
 * sidebar-nav.tsx 用 transform: rotate 控制方向，這裡固定畫「朝下」
 * 的樣子）。 */
export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** 2026-08-31 新增：說明橫幅用的「ℹ️」——安安參考同行 Hocar 的報表頁面，
 * 在容易誤會的數字旁邊放一個淺色底＋ℹ️圖示的說明框（例如「淨利／分潤
 * 試算」的月營運費用為什麼是 0）。跟其他側邊欄圖示一樣不用 emoji，
 * 用同一套線條 SVG 風格自己畫一個，深色圓圈外框＋中間一豎一點。 */
export function IconInfo(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 2026-08-31 新增：空狀態圖示——報表/卡片沒有資料時用（取代直接顯示
 * 一個容易被誤會成「壞掉了」的 $0），畫一個簡化的空托盤/收件匣線條圖。 */
export function IconEmptyState(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12.5l2-6.6A1.6 1.6 0 0 1 7.5 4.8h9a1.6 1.6 0 0 1 1.5 1.1l2 6.6" />
      <path d="M4 12.5h5.2l.8 1.7h4l.8-1.7H20" />
      <path d="M4 12.5v5a1.6 1.6 0 0 0 1.6 1.6h12.8A1.6 1.6 0 0 0 20 17.5v-5" />
    </svg>
  );
}
