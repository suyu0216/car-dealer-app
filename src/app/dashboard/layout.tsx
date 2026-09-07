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
import { SidebarNav, type SidebarNavItem, type SidebarNavGroup } from "./_components/sidebar-nav";
import { NotificationBell } from "./_components/notification-bell";
import type { Notification } from "@/lib/supabase/types";
import {
  IconHome,
  IconInventory,
  IconSales,
  IconDocument,
  IconUsers,
  IconCar,
  IconWrench,
  IconWallet,
  IconBriefcase,
  IconChart,
  IconPalette,
  IconGear,
  IconContact,
  IconReceipt,
} from "./_components/nav-icons";

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

  // 2026-08-31 改版：安安參考同行 Hocar 車輛管理系統的側邊欄（分類收合＋
  // 統一線條圖示＋短標籤），提出「欄位很不清楚」的意見。這裡把原本 11 個
  // 攤平列出的項目，改成「獨立列出（只有 1 個功能、不用分組）」＋
  // 「分類群組（可展開/收合，見 sidebar-nav.tsx 的 SidebarNavGroup）」
  // 混合的結構，標籤也統一縮短（例如「整備維修與會計請款」→「維修
  // 請款」，長說明留給頁面裡的副標題，不塞進側邊欄名稱）：
  //   車輛庫存（獨立，首頁）
  //   銷售與客戶（群組）：買賣合約／客戶追蹤／估車申請
  //   維修與財務（群組）：維修請款／業務薪資／公司帳務
  //   經營數據（獨立，只有 1 項不分組）
  //   系統設定（群組，只有車行管理員看得到）：品牌設定／帳號權限／
  //     我的聯繫方式——一般員工看不到這個群組，但「我的聯繫方式」
  //     所有人都要能改自己的資料，所以在群組外面另外準備一份獨立項目。
  //
  // 跟 dashboard-shell.tsx 的 `modules` 清單保持完全一致的項目跟權限
  // 判斷條件（href／module 完全沒變，只有 label／icon／分組方式改變）
  // ——這裡只是換一種可以從側邊欄直接點的呈現方式，實際渲染的還是同一個
  // /dashboard 頁面裡的同一批模組。
  const navItems: (SidebarNavItem | SidebarNavGroup)[] = [
    // 2026-09-04 新增：「儀表板／總覽」取代車輛庫存管理成為新的首頁——
    // 安安參考 Hocar 系統反映「不清楚現在要處理什麼」，這裡放一頁濃縮
    // 現況的總覽（見 overview-module.tsx），車輛庫存管理往後退一個位置、
    // 改成要帶 module=inventory 才會選到，不再是空網址對應的預設分頁。
    { key: "overview", label: "儀表板", icon: <IconHome />, href: "/dashboard" },
    {
      key: "inventory",
      label: "車輛庫存",
      icon: <IconInventory />,
      href: "/dashboard?module=inventory",
      module: "inventory",
    },
    {
      type: "group" as const,
      key: "salesGroup",
      label: "銷售與客戶",
      icon: <IconSales />,
      children: [
        { key: "deals", label: "買賣合約", icon: <IconDocument />, href: "/dashboard?module=deals", module: "deals" },
        { key: "crm", label: "客戶追蹤", icon: <IconUsers />, href: "/dashboard?module=crm", module: "crm" },
        {
          key: "tradeIns",
          label: "估車申請",
          icon: <IconCar />,
          href: "/dashboard?module=tradeIns",
          module: "tradeIns",
          badge: pendingTradeInCount,
        },
      ],
    },
    {
      type: "group" as const,
      key: "financeGroup",
      label: "維修與財務",
      icon: <IconWrench />,
      children: [
        {
          key: "maintenance",
          label: "維修請款",
          icon: <IconWrench />,
          href: "/dashboard?module=maintenance",
          module: "maintenance",
          badge: pendingRepairCount,
        },
        {
          key: "commission",
          label: "業務薪資",
          icon: <IconWallet />,
          href: "/dashboard?module=commission",
          module: "commission",
        },
        // 2026-08-29：這個入口以前用 canViewCost 判斷要不要顯示，但頁面
        // 本身（accounting/page.tsx）真正檢查的是 canManageFinance（開放
        // 公司開銷/資金總覽/淨利分潤）或 canViewSalary（只開放薪資單、
        // 只看自己）——兩邊條件對不起來，會出現「一般員工（預設
        // canViewCost=false、canViewSalary=true）理論上能看自己的薪資單，
        // 但側邊欄根本沒有入口點得進去」這種落差。改成跟頁面實際邏輯
        // 一致，兩者有一個成立就顯示入口。
        ...(permissions.canManageFinance || permissions.canViewSalary
          ? [{ key: "accounting", label: "公司帳務", icon: <IconBriefcase />, href: "/dashboard/accounting" }]
          : []),
        // 2026-09-05 新增：報表分析（單台車結算／業務報表／稅金報表／
        // 未售車整備成本／營運報表），見 reports/page.tsx 開頭的說明——
        // 財務敏感報表，只有 canManageFinance（老闆/會計）看得到，跟
        // 「公司帳務」同一組人、同一個群組。
        ...(permissions.canManageFinance
          ? [{ key: "reports", label: "報表分析", icon: <IconChart />, href: "/dashboard/reports" }]
          : []),
        // 2026-09-07 新增：「發票」——安安要手開發票，需要一眼看到每台
        // 已售出車輛的完整資料鏈（入庫日期／過戶來源賣家／進貨金額／
        // 售出金額／買方／買方統編），底下還嵌了 Simpany 的「手開發票
        // 小幫手」試算小工具。會顯示進貨成本這種敏感財務欄位，跟「公司
        // 帳務」「報表分析」不同，這裡用 canViewCost 把關（跟車輛庫存
        // 管理看得到成本欄位的權限一致），不是 canManageFinance——店長
        // 預設就有 canViewCost，也應該看得到這個功能才能協助開發票。
        ...(permissions.canViewCost
          ? [{ key: "invoices", label: "發票", icon: <IconReceipt />, href: "/dashboard?module=invoices", module: "invoices" }]
          : []),
      ],
    },
    // 「車行經營數據看板」以前跟「檢視成本與底價」綁在一起，兩者沒辦法
    // 分開勾選，現在改用獨立的 canViewAnalytics 判斷（見
    // src/lib/permissions.ts）。目前只有這一項，不特別包成一個只有一個
    // 小孩的群組。
    ...(permissions.canViewAnalytics
      ? [
          {
            key: "analytics",
            label: "經營數據",
            icon: <IconChart />,
            href: "/dashboard?module=analytics",
            module: "analytics",
          },
        ]
      : []),
    ...(permissions.canManageStaff
      ? [
          {
            type: "group" as const,
            key: "systemGroup",
            label: "系統設定",
            icon: <IconGear />,
            children: [
              {
                key: "branding",
                label: "品牌設定",
                icon: <IconPalette />,
                href: "/dashboard?module=branding",
                module: "branding",
              },
              {
                key: "settings",
                label: "帳號權限",
                icon: <IconGear />,
                href: "/dashboard?module=settings",
                module: "settings",
              },
              {
                key: "myContact",
                label: "我的聯繫方式",
                icon: <IconContact />,
                href: "/dashboard?module=myContact",
                module: "myContact",
              },
            ],
          },
        ]
      : [
          // 車行管理員以外的角色看不到「系統設定」群組（品牌設定／帳號
          // 權限都是管理功能），但「我的公開聯繫方式」是改自己的資料、
          // 不是管理功能，所有角色都要能點得到，所以獨立列出一份。
          {
            key: "myContact",
            label: "我的聯繫方式",
            icon: <IconContact />,
            href: "/dashboard?module=myContact",
            module: "myContact",
          },
        ]),
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
