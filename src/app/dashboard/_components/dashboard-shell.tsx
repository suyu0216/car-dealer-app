"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Car, Customer, Deal, RepairItem, Tenant, TenantVideo, TradeInRequest } from "@/lib/supabase/types";
import type { EffectivePermissions } from "@/lib/permissions";
import { CarsManager } from "./cars-manager";
import { MaintenanceModule } from "./maintenance-module";
import { CrmModule } from "./crm-module";
import { TradeInModule } from "./trade-in-module";
import { DealsModule } from "./deals-module";
import { AnalyticsModule } from "./analytics-module";
import { CommissionModule } from "./commission-module";
import { SettingsModule, type StaffAccount } from "./settings-module";
import { BrandSettingsModule } from "./brand-settings-module";
import { MyContactModule } from "./my-contact-module";

type ModuleKey =
  | "inventory"
  | "maintenance"
  | "crm"
  | "tradeIns"
  | "deals"
  | "analytics"
  | "commission"
  | "branding"
  | "settings"
  | "myContact";

const MODULE_KEYS: ModuleKey[] = [
  "inventory",
  "maintenance",
  "crm",
  "tradeIns",
  "deals",
  "analytics",
  "commission",
  "branding",
  "settings",
  "myContact",
];

function parseModuleParam(value: string | null): ModuleKey | null {
  return value && (MODULE_KEYS as string[]).includes(value) ? (value as ModuleKey) : null;
}

export function DashboardShell({
  cars,
  repairItems,
  customers,
  deals,
  staff,
  staffAccounts,
  currentUserId,
  receiptUrls,
  permissions,
  tenant,
  tenantName,
  myContact,
  tradeInRequests,
  tenantVideos,
}: {
  cars: Car[];
  repairItems: RepairItem[];
  customers: Customer[];
  deals: Deal[];
  staff: { id: string; name: string | null }[];
  staffAccounts: StaffAccount[];
  currentUserId: string;
  receiptUrls: Record<string, string>;
  permissions: EffectivePermissions;
  /** 車行完整資料，給「品牌設定」分頁編輯用。 */
  tenant: Tenant | null;
  tenantName?: string;
  /** 目前登入者自己的公開聯繫方式，給「我的公開聯繫方式」分頁編輯用——
   * 任何角色都看得到這個分頁，不受 permissions.canManageStaff 限制。 */
  myContact: {
    public_phone: string | null;
    public_line_id: string | null;
    show_public_contact: boolean;
    public_bio: string | null;
    public_avatar_url: string | null;
  };
  /** 公開展間「我要估車」表單送出的估價需求單清單，給「估車申請」分頁
   * 用，見 trade-in-module.tsx。 */
  tradeInRequests: TradeInRequest[];
  /** 「影音專區」現有影片清單，給「品牌設定」分頁底下的
   * VideoSettingsSection 用。 */
  tenantVideos: TenantVideo[];
}) {
  const searchParams = useSearchParams();
  const moduleParam = searchParams.get("module");

  // 側邊欄（dashboard/layout.tsx 的 SidebarNav）用 <Link href="/dashboard?module=xxx">
  // 深連結到指定分頁籤；初始值先看網址上的 module 參數，沒有（或不合法）
  // 才退回車輛庫存管理。
  const [active, setActiveState] = useState<ModuleKey>(() => parseModuleParam(moduleParam) ?? "inventory");

  // 從側邊欄點另一個分頁籤連結時，Next.js 在同一個頁面元件實例上做
  // client-side 導覽（不會整個重新 mount DashboardShell），只有上面的
  // useState 初始值不會再被重新計算——所以另外用 useEffect 監聽網址上
  // module 參數的變化，同步更新 active，不然畫面會停在原本的分頁籤上、
  // 跟網址、側邊欄的選中樣式對不起來。
  //
  // 這裡原本寫成「只有 parsed 有值才更新」，導致從側邊欄點回「車輛庫存
  // 管理」（連結是 /dashboard，網址上完全沒有 module 參數，parsed 會是
  // null）時這個 if 直接跳過、active 卡在前一個分頁籤——這正是「點了
  // 車輛庫存管理，畫面卻還停在整備維修」的原因。修法：不管 parsed 有沒有
  // 值都要更新，沒有值就照 parseModuleParam 的規則退回 inventory。
  useEffect(() => {
    setActiveState(parseModuleParam(moduleParam) ?? "inventory");
  }, [moduleParam]);

  // 分頁籤的導覽本身已經整合進側邊欄（dashboard/layout.tsx 的
  // SidebarNav，用 <Link href="/dashboard?module=xxx"> 深連結），這裡原本
  // 還有一整排功能一模一樣的橫向分頁籤按鈕，兩套導覽各自獨立可以點、
  // 又是分開的 React 狀態，正是「點了側邊欄的車輛庫存管理，畫面卻還停在
  // 整備維修」這類同步 bug 的根源，使用者確認過只需要側邊欄，這裡直接
  // 拿掉重複的那一套，只留下面「依 activeModule 決定顯示哪個模組內容」
  // 的邏輯——這才是真正需要的部分，側邊欄的連結負責改網址、上面的
  // useEffect 負責把網址同步回 activeModule。
  //
  // 待審核請款數量的提醒（原本顯示在這排分頁籤的「整備維修」按鈕上）
  // 改到側邊欄對應項目上顯示，見 sidebar-nav.tsx 的 badge、
  // dashboard/layout.tsx 查 pendingRepairCount 那段。
  const modules: ModuleKey[] = [
    "inventory",
    "maintenance",
    "crm",
    // 估車申請跟 CRM 客戶名單同一個道理：本質上是業務跟進工作，不是需要
    // 特別把關的管理功能，所有角色都看得到，不用 canManageStaff 擋。
    "tradeIns",
    "deals",
    "commission",
    // 2026-08-29：「車行經營數據看板」原本跟 canViewCost 綁在一起，現在
    // 拆成獨立的 canViewAnalytics 權限，兩者可以分開勾選（見
    // src/lib/permissions.ts 的說明）。
    ...(permissions.canViewAnalytics ? (["analytics"] as ModuleKey[]) : []),
    ...(permissions.canManageStaff ? (["branding", "settings"] as ModuleKey[]) : []),
    // 「我的公開聯繫方式」是改自己的資料，不是管理功能，所有角色都看得到，
    // 不用 canManageStaff 擋——見 my-contact-module.tsx 開頭的說明。
    "myContact",
  ];

  // 如果目前選到的分頁因為權限變動（例如管理員把自己的權限搞丟，理論上
  // 不會發生，但保險起見）而不再存在於清單裡，就退回車輛庫存管理，
  // 避免畫面停留在一個已經不存在的分頁上。
  const activeModule = modules.includes(active) ? active : "inventory";

  return (
    <div className="mt-6">
        {activeModule === "inventory" && (
          <CarsManager
            cars={cars}
            repairItems={repairItems}
            receiptUrls={receiptUrls}
            permissions={permissions}
            tenantName={tenantName}
            staff={staff}
          />
        )}
        {activeModule === "maintenance" && (
          <MaintenanceModule
            repairItems={repairItems}
            cars={cars}
            canReview={permissions.canApproveRepairs}
            receiptUrls={receiptUrls}
            staff={staff}
          />
        )}
        {activeModule === "crm" && (
          <CrmModule customers={customers} staff={staff} isTenantAdmin={permissions.canManageStaff} />
        )}
        {activeModule === "tradeIns" && <TradeInModule tradeInRequests={tradeInRequests} />}
        {activeModule === "deals" && (
          // 2026-08-30：合約的「業務抽成／稅金」與「標記已交車」原本綁在
          // canManageStaff（只有老闆）——安安反映合約流程是員工填寫送出、
          // 由「會計」審核填稅金/抽成後才結案，不是老闆自己一個個填，
          // 所以改成 canManageFinance（老闆恆為 true，會計預設也是
          // true，店長/員工預設 false），見 deals-actions.ts 跟
          // deal-form-modal.tsx 的說明。
          <DealsModule
            deals={deals}
            cars={cars}
            customers={customers}
            staff={staff}
            canManageFinance={permissions.canManageFinance}
            tenantName={tenantName}
            repairItems={repairItems}
          />
        )}
        {activeModule === "commission" && (
          <CommissionModule
            deals={deals}
            cars={cars}
            staff={staff}
            currentUserId={currentUserId}
            // 「看得到全部」現在不是只有老闆（canManageStaff）——會計預設也
            // 看得到全體薪資（canViewAllSalary），店長/員工則預設不行，見
            // src/lib/permissions.ts 的 ROLE_DEFAULT_PERMISSIONS。
            canManageStaff={permissions.canManageStaff || permissions.canViewAllSalary}
            canViewSalary={permissions.canViewSalary}
          />
        )}
        {activeModule === "analytics" && permissions.canViewAnalytics && (
          <AnalyticsModule
            cars={cars}
            repairItems={repairItems}
            deals={deals}
            staff={staff}
            canViewCommission={permissions.canViewAllSalary || permissions.canManageFinance}
          />
        )}
        {activeModule === "branding" && permissions.canManageStaff && tenant && (
          <BrandSettingsModule tenant={tenant} tenantVideos={tenantVideos} />
        )}
        {activeModule === "settings" && permissions.canManageStaff && (
          <SettingsModule staffAccounts={staffAccounts} currentUserId={currentUserId} />
        )}
        {activeModule === "myContact" && <MyContactModule myContact={myContact} />}
    </div>
  );
}
