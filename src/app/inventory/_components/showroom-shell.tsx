"use client";

// /inventory 展間五個獨立頁面共用的外殼——頁首（Logo/車行資訊/加 LINE
// 按鈕）、導覽選單（品牌簡介／服務項目／現有車輛／我要估車／成交案件）、
// 頁尾（門市地圖/社群連結/免責聲明）、手機版浮動加 LINE 按鈕。
//
// 2026-08 從單一超長頁面（原本全部塞在 /inventory 一頁，服務項目/品牌
// 價值主張/影音專區/車輛清單+篩選/成交案例/估車表單/聯繫業務全部疊在
// 一起，滑到底要滑很久）拆成五個獨立頁面，是直接回應使用者的意見——
// 她指名參考的競品站台（弘達國際汽車）用的就是這種「上面一排選單，點
// 進去才是對應內容」的多頁結構，不是一頁全部塞滿。拆頁之後每個頁面只
// 專心做一件事，也才符合她原本就提出的「清楚、簡單」的要求。
//
// 2026-08 再改：使用者進一步指名參考站台的導覽列「最上面會放大、往下滑
// 會縮小並且黏著」——實測過那個站台，效果是「頁首＋選單本來是一整條
// 較高的深色列，往下捲動之後同一條列會變矮、Logo 縮小，同時整條列固定
// 貼在畫面最上方」，不是選單本身變成另一種東西。這裡做法比照：把頁首
// （Logo/車行資訊/加 LINE 按鈕）跟導覽選單合併成同一個 `sticky top-0`
// 區塊，用 `scrolled` 這個 state（監聽 window scroll，超過一點捲動距離
// 就切成 true）切換一套更緊湊的版本——Logo、車行名稱字級、內距都縮小，
// 電話/地址/營業時間那行在縮小版直接隱藏（捲動時畫面空間有限，這行本來
// 就是輔助資訊，不影響回到最上方時完整顯示），縮小版的加 LINE 按鈕跟
// 導覽選單本身文字大小不變，維持容易點擊的熱區。這是這個外殼第一次需要
// client 端狀態（滾動位置），所以整份檔案改成 "use client"——Server
// Component 頁面（services/trade-in/sold）直接呼叫、Client Component
// （cars/home）當一般元件 import 使用都完全不受影響，React 允許 Server
// Component 直接渲染 Client Component。
//
// 「同一時間只能有一層 fixed 滿版遮罩」的 Chromium 合成錯誤（見
// showroom-lightbox.tsx 開頭的完整說明）跟這個外殼無關——那個問題只在
// 車輛詳情 Modal／首圖放大檢視這兩個「真的整片蓋滿螢幕」的遮罩開啟時
// 才會發生，各自由 showroom-cars-section.tsx／showroom-home-section.tsx
// 自己處理（把包含這個外殼在內的整頁內容包進 `hidden`）。這裡頁尾常駐的
// 浮動加 LINE 按鈕只是個小按鈕（`fixed bottom-5 right-5`，不是
// `inset-0` 整片遮罩），不屬於同一種情況，不需要特殊處理。
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ShowroomTenant } from "@/lib/supabase/public-tenant";
import {
  lineAddFriendUrl,
  SocialIcon,
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
} from "./showroom-shared";

export type ShowroomNavKey = "home" | "services" | "cars" | "tradeIn" | "sold";

const NAV_ITEMS: { key: ShowroomNavKey; label: string; path: string }[] = [
  { key: "home", label: "品牌簡介", path: "/inventory" },
  { key: "services", label: "服務項目", path: "/inventory/services" },
  { key: "cars", label: "現有車輛", path: "/inventory/cars" },
  { key: "tradeIn", label: "我要估車", path: "/inventory/trade-in" },
  { key: "sold", label: "成交案件", path: "/inventory/sold" },
];

/** 導覽選單每個項目搭配一個對應語意的線條小圖示——跟 showroom-shared.tsx
 * 的 GENERIC_SHOWCASE_ICONS 同一套黑白線條風格（stroke 為主、不用色塊），
 * 但這五個是專屬這份導覽選單的語意圖示（房子=品牌簡介、扳手=服務項目、
 * 車子=現有車輛、交換箭頭=估車換車、勾選圓=已成交），不是隨機輪流套用，
 * 放在 showroom-shell.tsx 而不是共用檔案，因為只有這裡會用到。 */
const NAV_ICONS: Record<ShowroomNavKey, (props: { className?: string }) => React.ReactElement> = {
  home: NavHomeIcon,
  services: NavServiceIcon,
  cars: NavCarIcon,
  tradeIn: NavTradeInIcon,
  sold: NavSoldIcon,
};

/** 捲動超過這個距離（px）才切成縮小版；往回捲要再退回這個距離以下才
 * 切回原本大小——兩個門檻故意不一樣（中間留一段「緩衝區」），不是筆誤。
 * 2026-08 修正「由下往上滑動時頁首會抖動」的問題：原本只有單一一個門檻
 * （24px），捲動位置剛好停在門檻附近時（尤其手機慣性捲動減速、或滑鼠
 * 滾輪微幅晃動），scrollY 會在門檻上下小幅度來回震盪，每次穿過門檻都會
 * 觸發 `scrolled` 這個 state 整個翻轉，頁首的內距/字級/Logo 大小全部都在
 * 300ms 內反覆播放「縮小⇄放大」的過場動畫，看起來就像頁首在原地發抖。
 * 用「進入縮小版」跟「退回原本大小」兩個不同的門檻（進入門檻比退回門檻
 * 高），只要捲動位置停在這兩個門檻中間，就不會被小幅度晃動誤觸切換，
 * 徹底消除這種來回震盪的抖動。
 *
 * 2026-08 再修：使用者手機實測「往上拉（swipe 往上滑，頁面往下捲）」
 * 還是會抖——上面這組雙門檻只解決了「scrollY 剛好停在門檻附近小幅晃動」
 * 這一種情況，但手機慣性捲動（momentum scroll）減速到底、或滑到最頂端
 * 觸發的橡皮筋回彈（overscroll bounce，scrollY 會先小幅衝過頭、或短暫
 * 變成負值，再彈回來），這個「回彈」過程本身就可能連續掃過 24px 這個
 * 退回門檻好幾次，雙門檻擋不住「同一次滑動裡連續掃過門檻」這種情況，
 * 只能擋住「靜止不動時的小幅晃動」。真正的解法是不要讓每次穿過門檻都
 * 立刻切換畫面：改用 `pendingScrolled` 暫存「這次捲動位置看起來該切換
 * 成的狀態」，用一個短暫的 timer 延遲真正套用；同一個 timer 期間如果又
 * 收到新的捲動事件、算出來的目標狀態又變了，就取消重新計時。這樣只有
 * 「捲動位置在某個狀態停留超過這段延遲（代表使用者是真的捲動到那裡，
 * 不是回彈中的過渡點）」才會真的觸發頁首縮放動畫。
 *
 * 2026-08 第三次修：使用者反映部署後線上實測還是會抖，改用真實裝置重新
 * 測試（不是只用理論上的雙門檻/延遲去推論）之後發現：原本 64px／24px
 * 這組門檻的「緩衝區」只有 40px 寬，落在一般人「捲一下滑一下、邊看邊
 * 停頓」的正常瀏覽動作範圍內——不是回彈這種極端情況才會穿過兩個門檻，
 * 光是正常滑動網頁想多看兩眼上面的首圖橫幅、再往下滑一點點看文字，
 * 捲動位置就很容易在 40px 這個窄範圍附近來回跨越，每跨越一次就真的觸發
 * 一次縮放動畫，多次之後看起來就是「一直在抖」。這裡加大緩衝區到 148px
 * 寬（進入 160px、退回 12px），一般瀏覽時的小範圍捲動幾乎不可能同時
 * 跨過這麼寬的兩個門檻，縮放動畫只會在使用者真的往下捲了一大段（明顯
 * 滑過首圖橫幅、進入下面的內容）才觸發一次，往上捲回到幾乎貼齊最頂端
 * 才會縮回原本大小，兩種情況都是「使用者確實有這個意圖」才會觸發，不會
 * 因為正常瀏覽時的小幅捲動而誤觸；延遲時間也從 80ms 加長到 150ms，多一
 * 層保險擋掉快速回彈。 */
const SHRINK_ENTER_THRESHOLD = 160;
const SHRINK_EXIT_THRESHOLD = 12;
const SHRINK_COMMIT_DELAY_MS = 150;

export function ShowroomShell({
  tenant,
  tenantId,
  active,
  children,
  hideFloatingLineButton,
}: {
  tenant: ShowroomTenant;
  tenantId: string;
  active: ShowroomNavKey;
  children: React.ReactNode;
  /** 2026-08 第十二輪：使用者反映手機版首頁一打開「感覺很亂」——實際
   * 原因之一是首頁首圖橫幅下面的「加LINE專人服務」長方形按鈕，跟這個
   * 檔案最下面常駐的浮動點火按鈕，兩個同時擠在畫面同一屏，看起來像是
   * 兩個重複的「加LINE」提示疊在一起。只有品牌簡介頁（showroom-
   * home-section.tsx）自己有這顆專屬的 hero LINE 按鈕，其他四個頁面
   * （服務項目/現有車輛/我要估車/成交案件）沒有，所以修法不是整頁拿掉
   * 浮動按鈕（那樣其他頁、以及首頁往下捲動離開 hero 之後，手機版使用者
   * 會找不到常駐的加 LINE 入口），而是讓首頁自己用 IntersectionObserver
   * 偵測 hero 那顆 LINE 按鈕目前在不在螢幕上，在螢幕上時把這個 prop
   * 傳 true，暫時淡出浮動按鈕；捲動離開 hero 之後這個 prop 變回
   * false，浮動按鈕才又淡入。其他頁面完全不傳這個 prop（undefined），
   * 效果等同 false，行為不受影響。 */
  hideFloatingLineButton?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  // 手機版導覽選單的展開狀態——2026-08 第七輪，使用者要求手機上的五個
  // 導覽項目收起來變成「≡」漢堡選單，點開才展開全部選項；桌機版維持
  // 原本那排常駐顯示的按鈕，不受這個 state 影響（見下面桌機版 <nav>
  // 直接忽略 navOpen）。
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    // pendingTimer：目前排隊等著要套用的「延遲確認」計時器，見上面
    // SHRINK_COMMIT_DELAY_MS 的說明——每次捲動事件算出來的目標狀態如果
    // 跟上一次排隊的不一樣，就取消舊的、重新排一個新的，只有目標狀態
    // 連續 80ms 沒再變過，才會真的呼叫 setScrolled 觸發頁首縮放動畫。
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTarget: boolean | null = null;

    function handleScroll() {
      setScrolled((prev) => {
        const target = prev
          ? window.scrollY > SHRINK_EXIT_THRESHOLD
          : window.scrollY > SHRINK_ENTER_THRESHOLD;

        if (target === prev) {
          // 目標狀態跟目前畫面顯示的一樣，不需要套用任何改變，順便把
          // 還在排隊、方向已經反悔的計時器取消掉，避免它晚一點還是
          // 誤觸發一次沒必要的切換。
          if (lastTarget !== null && lastTarget !== target) {
            if (pendingTimer) clearTimeout(pendingTimer);
            pendingTimer = null;
            lastTarget = null;
          }
          return prev;
        }

        if (lastTarget === target && pendingTimer) {
          // 目標狀態跟上一次排隊的相同，計時器已經在跑，不用重排。
          return prev;
        }

        // 目標狀態變了（或第一次出現）：取消舊計時器、重新排一個，只有
        // 這個目標狀態撐過 80ms 沒再被推翻，才會真的切換畫面。
        if (pendingTimer) clearTimeout(pendingTimer);
        lastTarget = target;
        pendingTimer = setTimeout(() => {
          pendingTimer = null;
          lastTarget = null;
          setScrolled(target);
        }, SHRINK_COMMIT_DELAY_MS);

        return prev;
      });
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* 頁首＋導覽選單合併成同一個常駐貼頂的區塊，捲動超過一點距離就
          切成縮小版——見檔案開頭的說明。 */}
      <div className="sticky top-0 z-20 bg-white shadow-sm">
        <header
          className="relative overflow-hidden"
          style={{
            background:
              "repeating-linear-gradient(135deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 6px), linear-gradient(180deg, #0d0f12 0%, #0a0b0d 100%)",
            borderBottom: "1px solid rgba(226,25,47,0.30)",
            boxShadow: "0 1px 0 rgba(226,25,47,0.12)",
          }}
        >
          {/* 2026-08 第四版：使用者上傳了自己設計的頁首橫幅參考檔案
              （jh-banner_1.css／jhbannerdemo_2.html），要求「橫幅改成
              這樣，按鈕一樣不改」——這裡只換頁首的底色/裝飾/品牌區塊，
              加 LINE 按鈕的 JSX/樣式完全沒有動（還是上一輪改好的黑底
              →hover 反轉、文字「加 LINE 專人服務」那顆）。跟上一版（純
              黑底＋單色對稱倒三角）不同，這版是使用者自己重新設計的
              「曜石底＋點火紅斜切」：背景不是純黑，是深黑漸層疊一層
              極淡的斜紋（repeating-linear-gradient）做出低調的碳纖維
              質感；左上角裝飾也從「對稱倒三角」換成使用者指定的不對稱
              斜切角（`polygon(0 0, 58% 0, 18% 100%, 0 100%)`，比之前的
              三角形更修長、更像賽車風格的切角，不是三角形），疊兩層：
              下面一層是紅→深紅漸層本體，上面一層用
              `mix-blend-mode: overlay` 疊一道白色高光，做出金屬斜切的
              反光質感（純 CSS 疊層，沒有用圖片）。這裡的紅色是使用者
              這次上傳檔案裡指定的新色號 #E2192F／#6E0F1A，跟全站按鈕
              系統的金棕色、價格用的橘紅色 #E8542D 都不是同一種顏色——
              因為這是使用者自己重新設計、明確要求「改成這樣」的橫幅
              專屬配色，不是要套用既有按鈕分類的規則，所以維持她指定的
              顏色，不強制改成金棕色。品牌圓徽（Logo）比照參考檔案换成
              深色放射漸層底＋白色細框＋紅色光暈外圈，取代舊版的白底
              白框；桌機/手機都會顯示這個斜切角裝飾（舊版只在桌機顯示、
              手機隱藏），手機版斜切角縮窄、頁首內容改成靠左對齊（不再
              置中），這兩點都是照著使用者上傳的 jh-banner_1.css 手機版
              media query 設計。 */}
          <div
            className="pointer-events-none absolute left-0 top-0 h-[220%] w-24 -translate-y-1/4 sm:w-[150px]"
            style={{
              background: "linear-gradient(150deg, #ff5b5b 0%, #E2192F 42%, #6E0F1A 100%)",
              clipPath: "polygon(0 0, 58% 0, 18% 100%, 0 100%)",
              opacity: 0.92,
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-0 top-0 h-[220%] w-24 -translate-y-1/4 sm:w-[150px]"
            style={{
              background: "linear-gradient(150deg, rgba(255,255,255,0.55) 0%, transparent 12%)",
              clipPath: "polygon(0 0, 58% 0, 18% 100%, 0 100%)",
              mixBlendMode: "overlay",
            }}
            aria-hidden
          />
          <div
            className={
              "relative z-10 mx-auto flex max-w-6xl flex-col items-start gap-3 pl-16 pr-5 text-left transition-all duration-300 sm:flex-row sm:items-center sm:justify-between sm:pl-24 sm:pr-8 " +
              (scrolled ? "py-2.5" : "py-[18px] sm:py-5")
            }
          >
            <div className="flex items-center gap-4">
              {tenant.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element -- 見 showroom-lightbox.tsx 的說明
                <img
                  src={tenant.logo_url}
                  alt={`${tenant.name} Logo`}
                  className={
                    "shrink-0 rounded-full border object-contain transition-all duration-300 " +
                    (scrolled ? "h-8 w-8 p-1" : "h-14 w-14 p-1.5")
                  }
                  style={{
                    borderColor: "rgba(255,255,255,0.14)",
                    background: "radial-gradient(circle at 32% 28%, #2b2d31, #0f1012 72%)",
                    boxShadow: "0 0 0 3px rgba(226,25,47,0.16), 0 6px 14px -6px rgba(0,0,0,0.7)",
                  }}
                />
              )}
              <div>
                <Link
                  href={`/inventory?tenant=${tenantId}`}
                  className={
                    "font-showroom-display tracking-wide text-[#f1f2f4] transition-all duration-300 " +
                    (scrolled ? "text-base" : "text-2xl")
                  }
                >
                  {tenant.name}
                </Link>
                {/* 電話/地址/營業時間——縮小版直接隱藏，捲動時畫面空間
                    有限，這行本來就是輔助資訊，回到最上方會完整顯示回來。 */}
                {(tenant.phone || tenant.address || tenant.business_hours) && (
                  <p
                    className={
                      "flex flex-wrap items-center gap-x-2.5 gap-y-0.5 overflow-hidden text-xs text-[#a3a8b1] transition-all duration-300 " +
                      (scrolled ? "mt-0 max-h-0 opacity-0" : "mt-1.5 max-h-8 opacity-100")
                    }
                  >
                    {tenant.phone && (
                      <a href={`tel:${tenant.phone}`} className="transition hover:text-[#BFA074]">
                        {tenant.phone}
                      </a>
                    )}
                    {tenant.address && (
                      <>
                        {tenant.phone && <span className="text-[#4a4f57]">·</span>}
                        <span>{tenant.address}</span>
                      </>
                    )}
                    {tenant.business_hours && (
                      <>
                        {(tenant.phone || tenant.address) && <span className="text-[#4a4f57]">·</span>}
                        <span>{tenant.business_hours}</span>
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* 2026-08 第七輪：使用者反映這顆點火按鈕在手機上「太大顆、
                太突兀」，而且手機版右下角本來就有另一顆常駐的浮動加
                LINE 按鈕（見檔案最下面），兩顆同時出現會重複——改成只在
                桌機顯示（`hidden sm:block` 包一層外層容器；不能直接把
                `hidden` 加在 .btn-ignite-wrap 那個元素本身，因為
                .btn-ignite-wrap 是 globals.css 裡的一般 CSS class、不是
                Tailwind 產生的規則，跟 Tailwind 的 `hidden` 同時作用在
                同一個元素上時哪個生效要看兩份規則在編譯後的 CSS 裡誰
                排在後面，順序不保證，容易出現「明明加了 hidden 但沒有
                真的被隱藏」的情況；包一層純 Tailwind 的外層 div 才能
                保證乾淨可靠地隱藏），手機版使用者一律用右下角那顆點火
                按鈕聯繫，不會少功能。桌機版沒有浮動按鈕，這顆維持顯示。
                2026-08 第十一輪：使用者要求桌機版這顆跟手機版浮動按鈕
                「顏色一樣、尺寸大一點」——顏色疊 .btn-ignite-line 換成
                跟手機版同一個 LINE 綠（見 globals.css 該 class 的說明），
                尺寸疊 .btn-ignite-lg 從 46px 放大到 54px，比手機版稍大
                一點（畢竟桌機頁首空間比手機版寬鬆，稍大一點視覺上也
                比較平衡），圖示描邊比照手機版改成白色。 */}
            {tenant.line_id && (
              <div className="hidden sm:block">
                <a
                  href={lineAddFriendUrl(tenant.line_id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="加 LINE 專人服務"
                  className="btn-ignite-wrap shrink-0"
                >
                  <span className="btn-ignite btn-ignite-line btn-ignite-lg">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.1 0-2.1-.2-3-.6L5 21l1.3-3.9C4.8 15.7 4 14 4 12Z" />
                    </svg>
                  </span>
                  <span className="ignite-label">加 LINE 專人服務</span>
                </a>
              </div>
            )}
          </div>
        </header>

        {/* 手機版導覽——2026-08 第七輪：使用者要求手機上原本可以左右
            滑動的五顆導覽按鈕收起來，改成「≡」漢堡選單，點開才展開
            全部選項（原本那排在窄螢幕上五顆同時攤開還是偏擠、偏搶眼）。
            展開的清單沿用跟桌機版同一顆按鈕語言（.btn-tex-primary），
            只是排列方向從橫排改直排，符合「同分類同按鈕」的原則；點
            某一項之後主動把選單收回去（onClick 裡 setNavOpen(false)），
            避免使用者跳到下一頁時選單還開著。桌機版完全不受影響，見
            下面 `hidden sm:block` 的桌機版 <nav>。 */}
        <nav className="border-b border-[#E5E5E5] bg-white/95 backdrop-blur sm:hidden">
          <div className="flex items-center justify-between px-6 py-2.5">
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              aria-label={navOpen ? "關閉選單" : "開啟選單"}
              aria-expanded={navOpen}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-[#171717] text-[#171717] transition-all duration-200 ease-out active:scale-90"
            >
              {navOpen ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
            <span className="font-showroom-display truncate text-[15px] tracking-wide text-[#171717]">
              {NAV_ITEMS.find((item) => item.key === active)?.label}
            </span>
            {/* 純粹用來跟左邊的漢堡鍵一樣寬，讓中間的頁面名稱視覺上置中。 */}
            <span className="h-9 w-9 shrink-0" aria-hidden />
          </div>
          {navOpen && (
            <div className="flex flex-col gap-2 border-t border-[#E5E5E5] px-6 py-3">
              {NAV_ITEMS.map((item) => {
                const Icon = NAV_ICONS[item.key];
                const isActive = active === item.key;
                return (
                  <Link
                    key={item.key}
                    href={`${item.path}?tenant=${tenantId}`}
                    onClick={() => setNavOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={
                      "btn-tex-primary flex items-center gap-2 rounded-sm border border-[#171717] px-4 py-2.5 text-[15px] font-medium tracking-wide transition-all duration-300 ease-out active:scale-[0.97] active:duration-100 " +
                      (isActive
                        ? "bg-white text-[#171717] shadow-[0_0_0_1.5px_#BFA074,0_10px_24px_-12px_rgba(191,160,116,0.5)]"
                        : "bg-[#171717] text-white shadow-[0_0_0_1px_rgba(191,160,116,0.55)] hover:bg-white hover:text-[#171717] hover:shadow-[0_0_0_1.5px_#BFA074,0_10px_28px_-10px_rgba(191,160,116,0.55)]")
                    }
                  >
                    <Icon className={"shrink-0 " + (isActive ? "opacity-100" : "opacity-80")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* 桌機版導覽——五個獨立頁面之間切換。2026-08 第三版：使用者直接
            指名參考按鈕陳列室的「鍍鉻」主要行動按鈕（car-buttons.css 的
            .btn-chrome），要求五個導覽項目全部換成同一顆按鈕——不是只有
            選中的項目變成按鈕、其他維持文字連結（那是舊版做法），而是
            五顆全部套用跟「立即看車」「送出估車申請」同一套主要行動
            按鈕語言（.btn-tex-primary，見 globals.css 開頭的「前台按鈕
            材質系統」說明）：預設黑底白字，hover 時反轉成白底黑字＋一道
            金色光斜線掃過。目前所在的頁面用「預先反轉」的方式標示——
            直接用 hover 之後那個白底黑字＋較粗金色光暈的樣子常駐顯示，
            不用另外發明第三種顏色，使用者才能一眼看出「現在在哪一頁」，
            同時五顆按鈕摸起來、看起來仍然是同一顆按鈕，只是其中一顆長
            期停在「被選中」的狀態。2026-08 第七輪：手機版改用上面的
            漢堡選單，這排只在桌機顯示（`hidden sm:block`）。 */}
        <nav className="hidden border-b border-[#E5E5E5] bg-white/95 backdrop-blur sm:block">
          <div className="relative">
            <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-6 py-2.5 no-scrollbar sm:gap-2.5">
              {NAV_ITEMS.map((item) => {
                const Icon = NAV_ICONS[item.key];
                const isActive = active === item.key;
                return (
                  <Link
                    key={item.key}
                    href={`${item.path}?tenant=${tenantId}`}
                    aria-current={isActive ? "page" : undefined}
                    className={
                      "btn-tex-primary group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-[#171717] font-medium tracking-wide transition-all duration-300 ease-out active:scale-[0.96] active:duration-100 " +
                      (scrolled ? "px-3 py-1.5 text-[13px]" : "px-4 py-2.5 text-[15px]") +
                      " " +
                      (isActive
                        ? "bg-white text-[#171717] shadow-[0_0_0_1.5px_#BFA074,0_10px_24px_-12px_rgba(191,160,116,0.5)]"
                        : "bg-[#171717] text-white shadow-[0_0_0_1px_rgba(191,160,116,0.55)] hover:bg-white hover:text-[#171717] hover:shadow-[0_0_0_1.5px_#BFA074,0_10px_28px_-10px_rgba(191,160,116,0.55)]")
                    }
                  >
                    <Icon
                      className={
                        "shrink-0 transition-opacity duration-300 " +
                        (isActive ? "opacity-100" : "opacity-80 group-hover:opacity-100")
                      }
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white/95 to-transparent" />
          </div>
        </nav>
      </div>

      {children}

      {teamAndMapFooter(tenant)}

      {/* 手機版底部多留一點空間（pb-24）——右下角有一顆常駐的浮動加 LINE
          按鈕，滑到頁面最底部時避免蓋住免責文字的最後幾個字；桌機版沒有
          這顆浮動按鈕，維持原本的留白就好。 */}
      <footer className="border-t border-[#E5E5E5] pb-24 pt-8 text-center text-xs tracking-wide text-[#A3A3A3] sm:pb-8">
        車輛資訊僅供參考，實際車況與價格請洽車行現場為準。
      </footer>

      {tenant.line_id && (
        <a
          href={lineAddFriendUrl(tenant.line_id)}
          target="_blank"
          rel="noreferrer"
          aria-label="加 LINE 專人服務"
          // hideFloatingLineButton 為 true 時（目前只有首頁會傳，見上面
          // props 說明）用淡出＋擋掉點擊/鍵盤焦點，不是直接整個不渲染
          // ——用 opacity 過渡而不是掛載/卸載，滑到 hero 區塊邊界附近
          // 反覆進出時才不會忽隱忽現地「跳」出來，而是平順淡入淡出。
          className={
            "btn-ignite-wrap fixed bottom-5 right-5 z-30 transition-opacity duration-300 sm:hidden " +
            (hideFloatingLineButton ? "pointer-events-none opacity-0" : "opacity-100")
          }
          tabIndex={hideFloatingLineButton ? -1 : undefined}
          aria-hidden={hideFloatingLineButton || undefined}
        >
          {/* 2026-08 第八輪：使用者要求手機版這顆浮動按鈕不要紅色、改成
              LINE 的顏色——疊加 .btn-ignite-line 修飾 class 把內圈換成
              LINE 綠（見 globals.css 該 class 開頭的說明），圖示描邊也
              從深棗紅 #1a0508（原本是為了在紅底上有對比度）改成白色，
              在綠底上對比度才夠，也更貼近 LINE 官方圖示本來就是白色的
              慣例。 */}
          <span className="btn-ignite btn-ignite-line">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.1 0-2.1-.2-3-.6L5 21l1.3-3.9C4.8 15.7 4 14 4 12Z" />
            </svg>
          </span>
          {/* 這顆浮動按鈕疊在頁面本身的米白底色上（不是深色頁首），
              .ignite-label 預設的白字在這裡看不清楚，用行內樣式蓋掉
              成深色文字、拿掉陰影。 */}
          <span className="ignite-label" style={{ color: "#171717", textShadow: "none" }}>
            加 LINE 專人服務
          </span>
        </a>
      )}
    </div>
  );
}

/** 門市位置地圖＋社群媒體傳送門——每個頁面的頁尾都會出現，用免金鑰的
 * Google 地圖嵌入網址（/maps?q=...&output=embed），不需要另外申請 Maps
 * API Key。抽成函式而不是元件，單純是因為只有這個檔案會用到，不需要
 * 額外的元件定義開銷。 */
function teamAndMapFooter(tenant: ShowroomTenant) {
  const hasAddress = !!tenant.address;
  const hasSocial = !!(tenant.facebook_url || tenant.instagram_url || tenant.tiktok_url);
  if (!hasAddress && !hasSocial) return null;

  return (
    <>
      {hasAddress && (
        <section className="border-t border-[#E5E5E5] bg-[#FAFAFA]">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <div className="flex items-center gap-4">
              <h2 className="font-showroom-display shrink-0 text-lg tracking-wide text-[#171717]">
                門市位置
              </h2>
              <div className="h-px flex-1 bg-[#E5E5E5]" />
            </div>
            <p className="mt-2 text-xs text-[#737373]">{tenant.address}</p>
            <div className="mt-4 overflow-hidden rounded-2xl border border-[#E5E5E5] shadow-sm">
              <iframe
                title={`${tenant.name} 地圖位置`}
                src={`https://www.google.com/maps?q=${encodeURIComponent(tenant.address!)}&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-72 w-full sm:h-96"
              />
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address!)}`}
              target="_blank"
              rel="noreferrer"
              className="btn-tex-link mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#171717] transition-colors duration-200 hover:text-[#BFA074]"
            >
              開啟 Google 地圖導航
              <span className="btn-tex-rule" aria-hidden />
            </a>
          </div>
        </section>
      )}

      {hasSocial && (
        <div className="border-t border-[#E5E5E5] bg-white py-12">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <p className="font-showroom-display text-[11px] uppercase tracking-[0.3em] text-[#737373]">
              Follow Us
            </p>
            <div className="mt-5 flex items-center justify-center gap-4">
              {tenant.facebook_url && (
                <SocialIcon href={tenant.facebook_url} label="Facebook">
                  <FacebookIcon />
                </SocialIcon>
              )}
              {tenant.instagram_url && (
                <SocialIcon href={tenant.instagram_url} label="Instagram">
                  <InstagramIcon />
                </SocialIcon>
              )}
              {tenant.tiktok_url && (
                <SocialIcon href={tenant.tiktok_url} label="抖音 / TikTok">
                  <TikTokIcon />
                </SocialIcon>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 導覽選單五個圖示——線條風格（stroke 為主，只有輪胎那兩個小圓點用
 * fill），跟 showroom-shared.tsx 的 GENERIC_SHOWCASE_ICONS 是同一套視覺
 * 語言（strokeWidth 1.7、圓角線頭/轉角），但語意跟導覽項目一一對應，
 * 只有這份選單會用到，所以留在這個檔案，不放進共用元件庫。 */
function NavHomeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function NavServiceIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M14.7 6.3a3.5 3.5 0 0 0-4.6 4.2L4.5 16.1a1.6 1.6 0 0 0 2.3 2.3l5.6-5.6a3.5 3.5 0 0 0 4.2-4.6l-2.4 2.4-2-2 2.5-2.3Z" />
    </svg>
  );
}

function NavCarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M5 16v-2.6c0-.4.2-.8.5-1l2-1.6c.3-.2.6-.3 1-.3h7c.4 0 .7.1 1 .3l2 1.6c.3.2.5.6.5 1V16" />
      <path d="M3.5 16h17v1.2a.9.9 0 0 1-.9.9h-1a.9.9 0 0 1-.9-.9V16H6.3v1.2a.9.9 0 0 1-.9.9h-1a.9.9 0 0 1-.9-.9V16Z" />
      <circle cx="7.3" cy="16" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16.7" cy="16" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NavTradeInIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M5.5 8h12.5M18 8l-3-3M18 8l-3 3" />
      <path d="M18.5 16H6M6 16l3-3M6 16l3 3" />
    </svg>
  );
}

function NavSoldIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="12" cy="12" r="8.3" />
      <path d="m8.3 12.3 2.6 2.6 4.8-5.4" />
    </svg>
  );
}
