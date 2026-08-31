// 側邊欄清單先前是九個寫死的連結，其中六個（CRM／買賣合約／業務薪資／
// 經營數據看板／品牌設定／帳號與權限管理）指到根本不存在的頁面路由，
// 點下去會直接 404——這六個功能其實都做在 /dashboard 主頁的分頁籤裡
// （見 dashboard-shell.tsx 的 `modules`），不是獨立網址。
//
// 這裡改成 async Server Component，跟 dashboard/page.tsx 一樣呼叫
// requireTenantUser() + getEffectivePermissions()，用同一套權限條件
// 產生連結清單：車輛庫存管理／公司會計與營運記帳是真的獨立頁面
// （／dashboard、／dashboard/accounting），其餘一律連到
// `/dashboard?module=xxx`，交給 dashboard-shell.tsx 讀取這個參數切換到
// 對應分頁籤——這樣側邊欄才能真的深連結到正確畫面，而不是連過去又要
// 使用者自己再點一次分頁籤。「整備維修與會計請款」同理指到 maintenance
// 分頁籤，不是先前那個查詢不存在資料表的 /dashboard/reimbursements
// （該路由現在改成直接 redirect 過來，見該檔案）。
//
// 另外原本的側邊欄品牌標題寫死「捷恒汽車」——這是多租戶系統，每一間
// 車行看到的側邊欄都應該顯示自己車行的名稱，不是開發時測試用的那一間，
// 這裡額外查一次 tenants.name 修正。
//
// 通知鈴鐺：原本只有 canManageStaff（老闆）看得到——2026-08-31 起放寬成
// canManageStaff 或 canManageFinance 也看得到（會計預設就有
// canManageFinance），理由是：維修請款待審核／公司開銷／新增車輛沒填
// 底價這幾種通知，實際處理的人常常是會計，不是只有老闆，原本只有老闆
// 看得到鈴鐺，會計反而要靠老闆口頭轉達才知道有東西要處理。跟一般業務
// 無關的東西還是不會顯示，只是把「誰算管理者」從只有老闆放寬成老闆或
// 會計。這裡先撈最近 20 筆（不分已讀/未讀，已讀的用來讓使用者往回滑
// 還看得到最近做過的事，不是撈完就消失）交給 NotificationBell 顯示，
// 未讀數字紅點由那邊自己算。
import { requireTenantUser, getTenantById } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions } from "@/lib/permissions";
import { SidebarNav, type SidebarNavItem } from "./_components/sidebar-nav";
import { NotificationBell } from "./_components/notification-bell";
import type { Notification } from "@/lib/supabase/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireTenantUser();
  const permissions = getEffectivePermissions(profile);

  const supabase = await createClient();
  // 2026-08 效能優化：改用 dal.ts 的 getTenantById()（cache() 包過）而不是
  // 自己在這裡查一次——見那邊的說明，同一次請求裡 dashboard/page.tsx 也
  // 需要同一筆車行資料，改成共用同一次查詢結果，不再各查各的。
  const tenant = await getTenantById(profile.tenant_id!);

  let notifications: Notification[] = [];
  let pendingRepairCount = 0;
  const canSeeNotifications = permissions.canManageStaff || permissions.canManageFinance;

  // 「估車申請」待處理筆數——跟上面通知/維修請款筆數不一樣，這個項目
  // 所有角色都看得到（不受 canSeeNotifications 限制，見下面 navItems 的
  // tradeIns 項目跟 dashboard-shell.tsx 的 modules 清單），所以放在
  // canSeeNotifications 判斷之外、一律查詢。
  const [managerData, { count: pendingTradeInCountRaw }] = await Promise.all([
    canSeeNotifications
      ? Promise.all([
          supabase
            .from("notifications")
            .select("id, tenant_id, type, title, message, actor_name, link, is_read, created_at")
            .order("created_at", { ascending: false })
            .limit(20),
          // 待審核維修請款筆數——原本顯示在 dashboard-shell.tsx 那排重複
          // 分頁籤按鈕的「整備維修」上，拿掉那排之後改成側邊欄項目的
          // 徽章，用 head: true 只拿筆數、不撈整批資料。
          supabase.from("repair_items").select("id", { count: "exact", head: true }).eq("status", "pending"),
        ])
      : Promise.resolve(null),
    supabase.from("trade_in_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  if (managerData) {
    const [{ data }, { count }] = managerData;
    notifications = (data ?? []) as Notification[];
    pendingRepairCount = count ?? 0;
  }
  const pendingTradeInCount = pendingTradeInCountRaw ?? 0;

  // 跟 dashboard-shell.tsx 的 `modules` 清單保持完全一致的項目跟權限
  // 判斷條件——這裡只是換一種可以從側邊欄直接點的呈現方式，實際渲染的
  // 還是同一個 /dashboard 頁面裡的同一批模組。
  const navItems: SidebarNavItem[] = [
    { key: "inventory", label: "車輛庫存管理", icon: "📦", href: "/dashboard" },
    {
      key: "maintenance",
      label: "整備維修與會計請款",
      icon: "🛠️",
      href: "/dashboard?module=maintenance",
      module: "maintenance",
      badge: pendingRepairCount,
    },
    { key: "crm", label: "CRM 客戶與賞車追蹤", icon: "👥", href: "/dashboard?module=crm", module: "crm" },
    {
      key: "tradeIns",
      label: "估車申請",
      icon: "🚙",
      href: "/dashboard?module=tradeIns",
      module: "tradeIns",
      badge: pendingTradeInCount,
    },
    { key: "deals", label: "買賣合約與交易", icon: "📄", href: "/dashboard?module=deals", module: "deals" },
    {
      key: "commission",
      label: "業務薪資",
      icon: "💰",
      href: "/dashboard?module=commission",
      module: "commission",
    },
    // 2026-08-29：這兩個入口原本共用 canViewCost 一個條件，各自拆開成
    // 對應自己實際存取邏輯的權限——
    //   - 「車行經營數據看板」以前跟「檢視成本與底價」綁在一起，兩者
    //     沒辦法分開勾選，現在改用獨立的 canViewAnalytics 判斷（見
    //     src/lib/permissions.ts）。
    //   - 「公司會計與營運記帳」這裡以前也是用 canViewCost 判斷要不要
    //     顯示入口，但頁面本身（accounting/page.tsx）真正檢查的是
    //     canManageFinance（開放公司開銷/資金總覽/淨利分潤）或
    //     canViewSalary（只開放薪資單、只看自己）——兩邊條件對不起來，
    //     會出現「一般員工（預設 canViewCost=false、canViewSalary=true）
    //     理論上能看自己的薪資單，但側邊欄根本沒有入口點得進去」這種
    //     落差。改成跟頁面實際邏輯一致，兩者有一個成立就顯示入口。
    ...(permissions.canViewAnalytics
      ? [
          {
            key: "analytics",
            label: "車行經營數據看板",
            icon: "📊",
            href: "/dashboard?module=analytics",
            module: "analytics",
          },
        ]
      : []),
    ...(permissions.canManageFinance || permissions.canViewSalary
      ? [{ key: "accounting", label: "公司會計與營運記帳", icon: "💼", href: "/dashboard/accounting" }]
      : []),
    ...(permissions.canManageStaff
      ? [
          {
            key: "branding",
            label: "品牌設定",
            icon: "🎨",
            href: "/dashboard?module=branding",
            module: "branding",
          },
          {
            key: "settings",
            label: "帳號與權限管理",
            icon: "⚙️",
            href: "/dashboard?module=settings",
            module: "settings",
          },
        ]
      : []),
    // 「我的公開聯繫方式」是改自己的資料、不是管理功能，所有角色都看得到，
    // 不放在上面 canManageStaff 的區塊裡——見 my-contact-module.tsx。
    {
      key: "myContact",
      label: "我的公開聯繫方式",
      icon: "📇",
      href: "/dashboard?module=myContact",
      module: "myContact",
    },
  ];

  return (
    // 2026-08 手機版適配：原本一律 `flex`（水平排列）——電腦版側邊欄＋
    // 主內容左右並排沒問題，但手機螢幕窄，硬要水平排列會把側邊欄跟主
    // 內容都擠成一條縫。改成手機版（預設）垂直堆疊、中大螢幕（md 以上）
    // 才切回水平排列；SidebarNav 自己內部也依螢幕寬度切換「手機頂列＋
    // 滑出選單」跟「電腦固定側邊欄」兩種呈現，兩邊要搭配著看。
    <div className="flex min-h-screen flex-col bg-neutral-100 md:flex-row">
      <SidebarNav
        items={navItems}
        tenantName={tenant?.name}
        bell={canSeeNotifications ? <NotificationBell initialNotifications={notifications} /> : undefined}
      />
      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
