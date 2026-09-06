"use client";

// 「報表分析」——2026-09-05 新增，把跟 Hocar 比較後補上的五個報表集中
//在這個獨立頁面：單台車結算報表／業務報表／稅金報表／未售車整備成本
// 報表／營運報表（見這次金流架構開頭的競品落差分析）。跟 accounting/
// page.tsx 一樣是獨立路由、自己抓資料，只有 canManageFinance（老闆/
// 會計）看得到——這幾個報表都牽涉成本／毛利／業務抽成等財務敏感資料，
// 跟「公司帳務」頁面同一套權限把關，不是一般員工能看的「經營數據看板」
// （那個是 canViewAnalytics，兩者不同）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getEffectivePermissions } from "@/lib/permissions";
import type { Role } from "@/lib/supabase/types";
import { CarSettlementReport, type CarSettlementSlice } from "../_components/reports/car-settlement-report";
import {
  SalesLeaderboardReport,
  type SalesLeaderboardDealSlice,
} from "../_components/reports/sales-leaderboard-report";
import { TaxReport, type CarTaxSlice } from "../_components/reports/tax-report";
import {
  UnsoldPrepCostReport,
  type CarPrepCostSlice,
  type RepairItemPrepSlice,
} from "../_components/reports/unsold-prep-cost-report";
import {
  OperationsTrendReport,
  type CarTrendSlice,
  type RepairItemTrendSlice,
} from "../_components/reports/operations-trend-report";

type ReportProfile = {
  id: string;
  tenant_id: string | null;
  /** 原本寫成 string，跟 permissions.ts 的 PermissionSource（role: Role）
   * 對不起來，會讓 next build 的 TypeScript 檢查直接失敗（TS2345）——
   * 這裡改用真正的 Role 聯合型別，跟 supabase/types.ts 一致。 */
  role: Role;
  can_view_cost: boolean;
  can_view_salary: boolean;
  can_edit_cars: boolean;
  can_view_all_salary: boolean;
  can_approve_repairs: boolean;
  can_manage_finance: boolean;
  can_view_analytics: boolean;
};

// 五個報表用得到的欄位聯集，一次查完，各報表元件自己挑需要的欄位用。
type ReportCar = CarSettlementSlice & CarTaxSlice & CarPrepCostSlice & CarTrendSlice;
type ReportDeal = SalesLeaderboardDealSlice;
type ReportRepairItem = RepairItemPrepSlice & RepairItemTrendSlice;

const TABS = [
  { key: "carSettlement", label: "🚗 單台車結算" },
  { key: "salesLeaderboard", label: "🏆 業務報表" },
  { key: "tax", label: "🧾 稅金報表" },
  { key: "unsoldPrepCost", label: "🛠️ 未售車整備成本" },
  { key: "operationsTrend", label: "📈 營運報表" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function ReportsPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabKey>("carSettlement");
  const [loading, setLoading] = useState(true);
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [canViewCommission, setCanViewCommission] = useState(false);

  const [cars, setCars] = useState<ReportCar[]>([]);
  const [deals, setDeals] = useState<ReportDeal[]>([]);
  const [repairItems, setRepairItems] = useState<ReportRepairItem[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string | null }[]>([]);

  const fetchData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select(
        "id, tenant_id, role, can_view_cost, can_view_salary, can_edit_cars, can_view_all_salary, can_approve_repairs, can_manage_finance, can_view_analytics"
      )
      .eq("id", user.id)
      .single();

    const effective = profileData ? getEffectivePermissions(profileData as ReportProfile) : null;
    const allowed = !!effective?.canManageFinance;
    setHasAccess(allowed);
    setCanViewCommission(!!effective?.canViewAllSalary || allowed);
    setAccessChecked(true);
    if (!allowed) {
      setLoading(false);
      return;
    }

    const [{ data: carsData }, { data: dealsData }, { data: repairData }, { data: staffData }] = await Promise.all([
      supabase
        .from("cars")
        .select(
          // 2026-09-06 補進 closed_acquisition_bonus_cost（收購獎金封存
          // 快照）——跟業務抽成一樣是真實成本，沒補進來的話單台車結算／
          // 營運報表的「淨利」會漏算這筆錢。
          "id, brand, model_name, license_plate, purchase_price, closed_prep_cost, transfer_fee, tax_amount, closed_commission_cost, closed_acquisition_bonus_cost, closed_total_cost, final_price, closed_at, status, created_at"
        ),
      supabase
        .from("deals")
        .select("id, salesperson_id, final_price, commission_amount, status, created_at, delivered_at"),
      supabase.from("repair_items").select("id, car_id, amount, status, reviewed_at, created_at"),
      supabase.from("profiles").select("id, name").order("name"),
    ]);

    if (carsData) setCars(carsData as ReportCar[]);
    if (dealsData) setDeals(dealsData as ReportDeal[]);
    if (repairData) setRepairItems(repairData as ReportRepairItem[]);
    if (staffData) setStaff(staffData);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading || !accessChecked) {
    return <div className="p-6 text-center text-sm text-neutral-400">載入中…</div>;
  }

  if (!hasAccess) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-16 text-center text-sm text-neutral-400">
        🔒 此功能尚未開放，請洽車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">📊 報表分析</h1>
        <p className="text-sm text-neutral-500">單台車結算／業務排行／稅金／未售車整備成本／營運趨勢，五個報表一次看</p>
      </div>

      <div className="mb-6 flex flex-wrap border-b border-neutral-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-semibold transition border-b-2 ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "carSettlement" && <CarSettlementReport cars={cars} canViewCommission={canViewCommission} />}
      {activeTab === "salesLeaderboard" && (
        <SalesLeaderboardReport deals={deals} staff={staff} canViewCommission={canViewCommission} />
      )}
      {activeTab === "tax" && <TaxReport cars={cars} />}
      {activeTab === "unsoldPrepCost" && <UnsoldPrepCostReport cars={cars} repairItems={repairItems} />}
      {activeTab === "operationsTrend" && (
        <OperationsTrendReport cars={cars} repairItems={repairItems} canViewCommission={canViewCommission} />
      )}
    </div>
  );
}
