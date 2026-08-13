"use client";

import { useState } from "react";
import type { Car, Customer, Deal, RepairItem, Role, Tenant } from "@/lib/supabase/types";
import type { EffectivePermissions } from "@/lib/permissions";
import { CarsManager } from "./cars-manager";
import { MaintenanceModule } from "./maintenance-module";
import { CrmModule } from "./crm-module";
import { DealsModule } from "./deals-module";
import { AnalyticsModule } from "./analytics-module";
import { CommissionModule } from "./commission-module";
import { SettingsModule, type StaffAccount } from "./settings-module";
import { BrandSettingsModule } from "./brand-settings-module";

type ModuleKey =
  | "inventory"
  | "maintenance"
  | "crm"
  | "deals"
  | "analytics"
  | "commission"
  | "branding"
  | "settings";

export function DashboardShell({
  cars,
  repairItems,
  customers,
  deals,
  staff,
  staffAccounts,
  currentUserId,
  receiptUrls,
  role,
  permissions,
  tenant,
  tenantName,
}: {
  cars: Car[];
  repairItems: RepairItem[];
  customers: Customer[];
  deals: Deal[];
  staff: { id: string; name: string | null }[];
  staffAccounts: StaffAccount[];
  currentUserId: string;
  receiptUrls: Record<string, string>;
  role: Role;
  permissions: EffectivePermissions;
  /** 車行完整資料，給「品牌設定」分頁編輯用。 */
  tenant: Tenant | null;
  tenantName?: string;
}) {
  const [active, setActive] = useState<ModuleKey>("inventory");
  const pendingReviewCount = repairItems.filter((r) => r.status === "pending").length;

  // 導覽列本身就依權限決定要不要顯示某個模組——不是「顯示但擋住」，而是
  // 一般業務根本看不到「車行經營數據看板」「帳號與權限管理」這兩個分頁
  // 存在，跟「業務薪資」在沒有 can_view_salary 時仍保留分頁、只是內容
  // 顯示鎖定訊息（讓使用者知道有這個功能、只是還沒開放）不太一樣。
  const modules: { key: ModuleKey; label: string; icon: string }[] = [
    { key: "inventory", label: "車輛庫存管理", icon: "📦" },
    { key: "maintenance", label: "整備維修與會計請款", icon: "🛠️" },
    { key: "crm", label: "CRM 客戶與賞車追蹤", icon: "👥" },
    { key: "deals", label: "買賣合約與交易", icon: "📄" },
    { key: "commission", label: "業務薪資", icon: "💰" },
    ...(permissions.canViewCost
      ? [{ key: "analytics" as ModuleKey, label: "車行經營數據看板", icon: "📊" }]
      : []),
    ...(permissions.canManageStaff
      ? [{ key: "branding" as ModuleKey, label: "品牌設定", icon: "🎨" }]
      : []),
    ...(permissions.canManageStaff
      ? [{ key: "settings" as ModuleKey, label: "帳號與權限管理", icon: "⚙️" }]
      : []),
  ];

  // 如果目前選到的分頁因為權限變動（例如管理員把自己的權限搞丟，理論上
  // 不會發生，但保險起見）而不再存在於清單裡，就退回車輛庫存管理，
  // 避免畫面停留在一個已經不存在的分頁上。
  const activeModule = modules.some((m) => m.key === active) ? active : "inventory";

  return (
    <div className="mt-6">
      {/* 導覽列：韓系極簡暖灰底色，選中的模組用柔和奶茶金標示 */}
      <nav className="flex flex-wrap gap-1.5 rounded-2xl border border-neutral-200 bg-[#F8F9FA] p-1.5 shadow-sm">
        {modules.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setActive(m.key)}
            className={
              "relative flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition " +
              (activeModule === m.key
                ? "bg-white text-[#A6793D] shadow-sm ring-1 ring-inset ring-[#E7DAC3]"
                : "text-neutral-500 hover:bg-white/60 hover:text-neutral-800")
            }
          >
            <span aria-hidden>{m.icon}</span>
            {m.label}
            {m.key === "maintenance" && pendingReviewCount > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B4813E] px-1 text-[10px] font-semibold text-white">
                {pendingReviewCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {activeModule === "inventory" && (
          <CarsManager
            cars={cars}
            repairItems={repairItems}
            receiptUrls={receiptUrls}
            role={role}
            permissions={permissions}
            tenantName={tenantName}
          />
        )}
        {activeModule === "maintenance" && (
          <MaintenanceModule
            repairItems={repairItems}
            cars={cars}
            role={role}
            receiptUrls={receiptUrls}
          />
        )}
        {activeModule === "crm" && <CrmModule customers={customers} />}
        {activeModule === "deals" && (
          <DealsModule
            deals={deals}
            cars={cars}
            customers={customers}
            staff={staff}
            canSetCommission={permissions.canManageStaff}
            tenantName={tenantName}
          />
        )}
        {activeModule === "commission" && (
          <CommissionModule
            deals={deals}
            cars={cars}
            staff={staff}
            currentUserId={currentUserId}
            canManageStaff={permissions.canManageStaff}
            canViewSalary={permissions.canViewSalary}
          />
        )}
        {activeModule === "analytics" && permissions.canViewCost && (
          <AnalyticsModule cars={cars} repairItems={repairItems} deals={deals} staff={staff} />
        )}
        {activeModule === "branding" && permissions.canManageStaff && tenant && (
          <BrandSettingsModule tenant={tenant} />
        )}
        {activeModule === "settings" && permissions.canManageStaff && (
          <SettingsModule staffAccounts={staffAccounts} currentUserId={currentUserId} />
        )}
      </div>
    </div>
  );
}
