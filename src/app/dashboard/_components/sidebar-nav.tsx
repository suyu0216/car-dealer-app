"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IconChevronDown } from "./nav-icons";

export interface SidebarNavItem {
  key: string;
  label: string;
  /** 2026-08-31：從 emoji 字串改成實際的圖示元素（見 nav-icons.tsx）——
   * emoji 在不同系統上粗細/顏色都不一樣，換成同一套手刻線條 SVG 才能
   * 保持一致，也才能跟著選中狀態變色（見下面 renderItem 傳的 className）。 */
  icon: React.ReactNode;
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

/** 2026-08-31 新增：側邊欄分類群組——安安參考同行 Hocar 車輛管理系統的
 * 側邊欄，發現我們原本是 11 個項目全部攤平列在一起，沒有分類、沒有
 * 層次感；改成把相關的項目收在同一個可展開/收合的父項目底下（車輛與
 * 維修／銷售與客戶／系統設定），跟 Hocar「車輛管理／報表分析／帳務
 * 管理」旁邊有小箭頭、點開才展開細項的做法一致。不是每個項目都需要
 * 分組——只有 1 個項目的（車輛庫存、經營數據看板）維持獨立列出，
 * 不需要為了「統一」硬包一層只有一個小孩的群組，這點也是照 Hocar 本身
 * 的做法（它的「儀表板」「顧客管理」等也是獨立列出，不是每個都分組）。 */
export interface SidebarNavGroup {
  type: "group";
  key: string;
  label: string;
  icon: React.ReactNode;
  children: SidebarNavItem[];
}

type SidebarNavEntry = SidebarNavItem | SidebarNavGroup;

function isGroup(entry: SidebarNavEntry): entry is SidebarNavGroup {
  return "type" in entry && entry.type === "group";
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
  items: SidebarNavEntry[];
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
    // 2026-09-04：「儀表板／總覽」取代「車輛庫存」成為空網址（沒有
    // module 參數）對應的分頁，這個特例判斷跟著換成 overview——見
    // layout.tsx 的說明，車輛庫存管理現在跟其他分頁一樣有 module 值，
    // 會走上面 item.module 那個分支，不再需要特例。
    if (item.key === "overview") {
      return pathname === "/dashboard" && !currentModule;
    }
    return pathname === item.href;
  }

  // 群組展開/收合狀態。
  // 2026-09-05 改法：安安反映每次登入「維修與財務」「銷售與客戶」都是
  // 自動展開的，她想要的是「預設收起來，自己要看才點開」——原本（見下面
  // 保留的舊註解脈絡）是刻意預設全部展開，現在改成預設全部收合
  // （new Set() 空集合），使用者點群組名稱才會展開，展開狀態仍然是
  // 用 key 存在同一個 Set 裡、電腦版側邊欄／手機版滑出選單共用同一份
  // 狀態，這點沒有變。
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderLeaf(item: SidebarNavItem, indent: boolean) {
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
          "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold transition " +
          (indent ? "ml-2 pl-2.5 " : "") +
          (active
            ? "bg-[#BFA074] text-white shadow-sm"
            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900")
        }
      >
        <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          {item.icon}
        </span>
        <span className="truncate">{item.label}</span>
        {!!item.badge && item.badge > 0 && (
          <span
            className={
              "ml-auto inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold " +
              (active ? "bg-white text-[#A6793D]" : "bg-[#B4813E] text-white")
            }
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </Link>
    );
  }

  function renderGroup(group: SidebarNavGroup) {
    const expanded = expandedGroups.has(group.key);
    // 群組收合時，把底下所有子項目的徽章加總顯示在群組本身上——不然
    // 收合起來會看不到「裡面有待處理事項」，使用者還要多點一次才發現。
    const totalBadge = group.children.reduce((sum, c) => sum + (c.badge ?? 0), 0);
    const anyChildActive = group.children.some((c) => isActive(c));
    return (
      <div key={group.key}>
        <button
          type="button"
          onClick={() => toggleGroup(group.key)}
          aria-expanded={expanded}
          className={
            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition " +
            (anyChildActive && !expanded
              ? "text-[#A6793D]"
              : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900")
          }
        >
          <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
            {group.icon}
          </span>
          <span className="truncate">{group.label}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {!expanded && totalBadge > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B4813E] px-1 text-[10px] font-semibold text-white">
                {totalBadge > 99 ? "99+" : totalBadge}
              </span>
            )}
            <IconChevronDown
              aria-hidden
              className={"h-3.5 w-3.5 transition-transform " + (expanded ? "" : "-rotate-90")}
            />
          </span>
        </button>
        {expanded && (
          <div className="mt-1 space-y-1 border-l border-neutral-200 pl-1">
            {group.children.map((child) => renderLeaf(child, true))}
          </div>
        )}
      </div>
    );
  }

  const navList = (
    <nav className="space-y-1">
      {items.map((entry) => (isGroup(entry) ? renderGroup(entry) : renderLeaf(entry, false)))}
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
