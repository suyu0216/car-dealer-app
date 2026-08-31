"use client";

// 後台鈴鐺通知——放在 dashboard/layout.tsx 的側邊欄頂部，跟臉書右上角
// 鈴鐺同樣的概念：未讀數字紅點、點開列出最近的通知，點單筆會標記
// 已讀並導去對應分頁（例如新的維修請款待審核 → 導去整備維修分頁）。
//
// 通知內容（哪些事件會產生通知）由伺服器端各自的 Server Action 決定，見
// src/lib/supabase/notifications.ts 的 createNotification()；這裡純粹是
// 顯示 + 標記已讀的互動邏輯，不知道、也不需要知道通知是怎麼產生的。
//
// 2026-08 手機版重做：原本不分螢幕大小，一律用「貼著鈴鐺按鈕、往右展開
// 的小下拉選單」。桌機版鈴鐺在側邊欄裡本來就靠左，往右展開沒問題；但
// 手機版頂列的鈴鐺排在最右邊（見 sidebar-nav.tsx 的手機頂列），320px
// 寬的下拉選單往右展開，大半段會直接超出螢幕右邊，這就是使用者反映
// 「內容跑到窗外」的原因。與其在原本的小下拉選單上一路修補定位，改成
// 手機版直接換一種更適合窄螢幕的呈現方式：從螢幕底部滑上來、滿版寬度
// 的通知面板（手機介面很常見、使用者熟悉的樣式，像訊息 App 的底部選單），
// 不再需要算「往左展開還是往右展開」這種容易在不同螢幕寬度下出錯的
// 定位邏輯。桌機版（md 以上）維持原本貼著鈴鐺展開的下拉選單，完全不變。
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/supabase/types";
import { formatDate } from "@/lib/format";
import { markAllNotificationsRead, markNotificationRead } from "../notifications-actions";

const TYPE_ICON: Record<Notification["type"], string> = {
  repair_item_pending: "🛠️",
  company_expense_created: "💼",
  // 2026-08 新增：公開展間「我要估車」表單送出時觸發，見
  // trade-in-actions.ts 的 submitTradeInRequest()。
  trade_in_request_created: "🚙",
  // 2026-08-31 新增：新增車輛入庫沒填底價，見 cars-actions.ts。
  car_floor_price_missing: "🏷️",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "剛剛";
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小時前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return formatDate(iso);
}

export function NotificationBell({ initialNotifications }: { initialNotifications: Notification[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // 每次從伺服器重新拿到的初始清單變了（例如切換頁面、resolvePath 重新
  // 整理），同步一次本地狀態——不然標記已讀後的本地樂觀更新會一直停留
  // 在舊資料上，新產生的通知也不會出現。
  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  // 點下拉選單外面就關閉，跟一般下拉選單的預期行為一致。手機版底部面板
  // 有自己的背景遮罩、點遮罩直接關閉（見下面 onClick），這裡的外部點擊
  // 判斷對桌機版下拉選單仍然有效，兩者不衝突。
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  function handleItemClick(n: Notification) {
    if (!n.is_read) {
      // 樂觀更新：先在畫面上標記已讀，不用等伺服器回應才消掉紅點。
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      startTransition(() => {
        markNotificationRead(n.id);
      });
    }
    setOpen(false);
    if (n.link) {
      router.push(n.link.startsWith("?") ? `/dashboard${n.link}` : n.link);
    }
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((x) => ({ ...x, is_read: true })));
    startTransition(() => {
      markAllNotificationsRead();
    });
  }

  const bodyProps = { notifications, unreadCount, pending, onItemClick: handleItemClick, onMarkAllRead: handleMarkAllRead };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="通知"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
      >
        <span aria-hidden className="text-lg">
          🔔
        </span>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B4813E] px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* 手機版：貼底部滑上來、滿版寬度的通知面板 + 背景遮罩。只在
              md 以下渲染，中大螢幕完全看不到這一段。 */}
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              aria-hidden
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/30"
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-hidden rounded-t-2xl border-t border-neutral-200 bg-white shadow-2xl">
              {/* 底部面板的「把手」視覺提示，讓人一眼認出這是可以滑掉的
                  面板，是手機介面常見的慣例。 */}
              <div className="flex justify-center pb-1 pt-2.5">
                <span aria-hidden className="h-1 w-10 rounded-full bg-neutral-200" />
              </div>
              <NotificationPanelBody {...bodyProps} listMaxHeightClassName="max-h-[calc(75vh-3rem)]" />
            </div>
          </div>

          {/* 桌機版：原本貼著鈴鐺按鈕展開的下拉選單，維持不變。 */}
          <div className="absolute left-0 top-full z-50 mt-2 hidden w-80 rounded-2xl border border-neutral-200 bg-white shadow-xl md:block">
            <NotificationPanelBody {...bodyProps} listMaxHeightClassName="max-h-96" />
          </div>
        </>
      )}
    </div>
  );
}

/** 通知面板的內容（標題列＋清單），手機底部面板跟桌機下拉選單共用同一份，
 * 只有外層容器（定位方式、圓角方向）不一樣——避免同一份清單邏輯、同一套
 * 已讀/導頁互動要維護兩次。 */
function NotificationPanelBody({
  notifications,
  unreadCount,
  pending,
  onItemClick,
  onMarkAllRead,
  listMaxHeightClassName,
}: {
  notifications: Notification[];
  unreadCount: number;
  pending: boolean;
  onItemClick: (n: Notification) => void;
  onMarkAllRead: () => void;
  listMaxHeightClassName: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-neutral-800">通知</h3>
        {unreadCount > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={onMarkAllRead}
            className="text-xs text-neutral-400 transition hover:text-[#A6793D] disabled:opacity-50"
          >
            全部標為已讀
          </button>
        )}
      </div>

      <div className={`${listMaxHeightClassName} overflow-y-auto`}>
        {notifications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-400">目前沒有通知</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onItemClick(n)}
                  className={
                    "block w-full px-4 py-3 text-left transition hover:bg-neutral-50 " +
                    (!n.is_read ? "bg-[#FBF1E4]/40" : "")
                  }
                >
                  <div className="flex items-start gap-2">
                    <span aria-hidden className="mt-0.5 text-base">
                      {TYPE_ICON[n.type] ?? "🔔"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-800">
                        {n.title}
                        {!n.is_read && (
                          <span
                            aria-hidden
                            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#B4813E]"
                          />
                        )}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{n.message}</p>
                      <p className="mt-1 text-[11px] text-neutral-400">{relativeTime(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
