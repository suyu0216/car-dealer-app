"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export interface SidebarNavItem {
  key: string;
  label: string;
  icon: string;
  href: string;
  /** 這個連結對應到 /dashboard 頁面裡的哪個分頁籤（module 參數）；
   * 不是分頁籤、而是自己獨立網址的項目（車輛庫存管理／公司會計與營運
   * 記帳）則不填。 */
  module?: string;
  /** 選填的數字徽章，例如「整備維修」項目上顯示待審核請款筆數——原本
   * 顯示在 dashboard-shell.tsx 那排重複分頁籤按鈕上，拿掉那排之後改到
   * 這裡顯示，見 dashboard/layout.tsx 查 pendingRepairCount 那段。 */
  badge?: number;
}

/**
 * 側邊欄導覽 —— 取代先前那份連到 6 個不存在頁面（會直接 404）的靜態清單。
 * 清單本身（含依權限決定要不要顯示某個項目）在 dashboard/layout.tsx
 * 產生，這裡只負責畫面呈現跟「目前選中哪一項」的高亮邏輯：車輛庫存管理／
 * 公司會計與營運記帳是各自獨立的網址，用 pathname 判斷；其餘項目都是
 * /dashboard 頁面裡的分頁籤，用網址上的 ?module= 參數判斷（跟
 * dashboard-shell.tsx 讀取/寫入的是同一個參數）。
 *
 * 2026-08 手機版適配：原本是固定 256px 寬、電腦/手機都一樣的側邊欄——
 * 手機螢幕通常只有 375px 左右寬，硬塞一個 256px 側邊欄會把主內容擠成
 * 一條窄縫，畫面看起來就是「電腦版被硬擠進手機」那種奇怪感，這是使用者
 * 實際反映的問題。改法：
 * - 中大螢幕（md 以上）：維持原本一路顯示的固定側邊欄，行為完全不變。
 * - 手機螢幕：側邊欄預設收起來，改成畫面最上面一條窄窄的列（漢堡選單
 *   按鈕＋車行名稱＋通知鈴鐺），點漢堡按鈕才從左邊滑出完整選單、蓋在
 *   內容上面（不佔版面空間），選背景遮罩或選單裡的連結都會自動收合。
 *   這是同一份元件、同一個網址依螢幕寬度切換兩種排版，不是另外做一個
 *   獨立的手機版網站。
 */
export function SidebarNav({
  items,
  tenantName,
  bell,
}: {
  items: SidebarNavItem[];
  tenantName?: string;
  /** 通知鈴鐺（NotificationBell），只有 canManageStaff 的人（車行管理員）
   * 才看得到——由 layout.tsx 決定要不要傳進來，這裡不知道權限規則，
   * 純粹「有給就顯示，沒給就不顯示」。手機版頂列跟電腦版側邊欄各自
   * 顯示一份（同一個 React element 被用在兩個地方，各自獨立掛載，
   * 同一時間只有其中一份看得到，不會互相干擾）。 */
  bell?: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentModule = searchParams.get("module");
  const [mobileOpen, setMobileOpen] = useState(false);

  // 換頁或切分頁籤之後自動收起手機版選單——不然點完連結，選單還開著蓋在
  // 新內容上面，使用者還要自己再點一次才能收起來。
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, currentModule]);

  function isActive(item: SidebarNavItem) {
    if (item.module) {
      return pathname === "/dashboard" && currentModule === item.module;
    }
    if (item.key === "inventory") {
      return pathname === "/dashboard" && !currentModule;
    }
    return pathname === item.href;
  }

  const navList = (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            // 這幾顆側邊欄連結預設不預先抓取（prefetch）——找到的效能問題：
            // Next.js 的 <Link> 預設只要出現在畫面上就會提前把目標頁面的
            // 資料整包抓回來，但 /dashboard 這個頁面完全動態（讀 cookie 判斷
            // 登入身份），沒有任何靜態/可快取的部分，「提前抓取」實際上
            // 就是完整重跑一次 dashboard/page.tsx 那一大包
            // Promise.all 查詢（車輛/客戶/合約/維修/員工全部查一次）——
            // 側邊欄一次有 7~9 個項目，等於網頁一載入就在背景同時打了
            // 7~9 次一模一樣的重查詢，實測（使用者提供的 Network 截圖）
            // 每個都要 400ms~1000ms 以上，互相搶頻寬／搶資料庫連線，
            // 這才是「整個網頁剛進去、切換頁面都慢」的主因，不是網路
            // 距離或圖片大小的問題。而且這裡點開分頁籤（module 參數）
            // 其實不需要重新跟伺服器要資料——DashboardShell 已經把
            // 所有模組的資料都以 props 形式拿在手上了，切換分頁籤純粹是
            // 前端狀態切換，加上這個連結存在只是為了讓網址可以被分享/
            // 加入書籤，不需要為了「可能被點」就提前重複查一次全部資料。
            prefetch={false}
            className={
              "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition " +
              (active
                ? "bg-[#BFA074] text-white shadow-sm"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900")
            }
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
            {!!item.badge && item.badge > 0 && (
              <span
                className={
                  "ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold " +
                  (active ? "bg-white text-[#A6793D]" : "bg-[#B4813E] text-white")
                }
              >
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* 手機版頂列：漢堡按鈕＋車行名稱＋通知鈴鐺，取代整塊側邊欄常駐
          佔用畫面空間。中大螢幕（md 以上）不顯示，那時候用下面固定側邊欄。 */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="開啟選單"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition hover:border-[#BFA074] hover:text-[#A6793D]"
        >
          <span aria-hidden className="text-lg leading-none">
            ☰
          </span>
        </button>
        <span className="truncate text-base font-extrabold text-neutral-900">
          {tenantName ?? "車行管理系統"}
        </span>
        <div className="flex shrink-0 items-center">{bell ?? <span className="h-9 w-9" />}</div>
      </div>

      {/* 電腦版：一路固定顯示的側邊欄，行為跟改版前完全一樣。 */}
      <aside className="hidden w-64 shrink-0 border-r border-neutral-200 bg-white p-4 md:block">
        <div className="mb-6 flex items-start justify-between gap-2 border-b border-neutral-100 pb-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold text-neutral-900">
              {tenantName ?? "車行管理系統"}
            </h1>
            <p className="text-xs text-neutral-400">車行管理系統</p>
          </div>
          {bell && <div className="shrink-0">{bell}</div>}
        </div>
        {navList}
      </aside>

      {/* 手機版滑出式選單：點漢堡按鈕才出現，蓋在內容上面（不佔版面
          空間），點背景遮罩或選單裡任何連結都會自動收起。中大螢幕不會
          渲染這一段（mobileOpen 只可能在手機版被設成 true，且下面容器
          也加了 md:hidden 雙重保險，就算意外殘留 mobileOpen=true 切到
          大螢幕也不會誤顯示）。 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col overflow-y-auto bg-white p-4 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-2 border-b border-neutral-100 pb-4">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-extrabold text-neutral-900">
                  {tenantName ?? "車行管理系統"}
                </h1>
                <p className="text-xs text-neutral-400">車行管理系統</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="關閉選單"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>
            {navList}
          </aside>
        </div>
      )}
    </>
  );
}
