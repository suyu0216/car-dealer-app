// 2026-09-04 新增：「儀表板／總覽」——安安看了同行 Hocar 車輛管理系統的
// 首頁儀表板後反映「我感覺我的欄位很不清楚」，這個模組就是要解決那個
// 問題：把車輛庫存管理／整備維修／估車申請／CRM 這幾個原本要分別點進去
// 才看得到現況的分頁，濃縮成一頁「一眼就知道現在要處理什麼」的總覽——
// 不新增任何資料表，全部用 dashboard/page.tsx 本來就查好、傳給
// DashboardShell 的 cars/repairItems/customers/deals/tradeInRequests 幾個
// 陣列在前端即時算出來，跟 analytics-module.tsx（車行經營數據看板）算
// 「場內在庫」「本月已結案」用的是同一套邏輯與月份歸屬規則（見那個檔案
// 開頭的說明），避免同一個系統對「這筆錢/這台車算哪個月」出現兩種不同
// 答案。
//
// 隱私分級：金額類卡片（本月銷售營業額／本月已實現毛利／在庫總成本）
// 只有 canViewAnalytics 的人看得到，跟「車行經營數據看板」本身的權限
// 要求一致——不能因為這是「首頁」就放寬，一般員工登入後如果沒有這個
// 權限，首頁只會看到台數/筆數這類不涉及金額的營運指標卡片。已實現毛利
// 這張卡片再進一步比照 analytics-module.tsx 的作法：沒有 canViewCommission
// 的人看到的毛利會把業務抽成加回去、並標註「不含業務抽成」，避免從毛利
// 數字反推出抽成金額。
import type { Car, Customer, Deal, RepairItem, TradeInRequest } from "@/lib/supabase/types";
import { carDisplayName, formatCurrency, formatDate, taiwanDateParts } from "@/lib/format";
import {
  IconInventory,
  IconWrench,
  IconCar,
  IconUsers,
  IconDocument,
  IconChart,
} from "./nav-icons";

function isThisMonth(iso: string, now: Date) {
  const a = taiwanDateParts(iso);
  const b = taiwanDateParts(now);
  return a.year === b.year && a.month === b.month;
}

export function OverviewModule({
  cars,
  repairItems,
  customers,
  deals,
  tradeInRequests,
  tenantName,
  canViewAnalytics,
  canViewCommission,
  canEditCars,
  onNavigate,
}: {
  cars: Car[];
  repairItems: RepairItem[];
  customers: Customer[];
  deals: Deal[];
  tradeInRequests: TradeInRequest[];
  tenantName?: string;
  /** 金額類卡片的顯示權限，跟「車行經營數據看板」共用同一個權限開關。 */
  canViewAnalytics: boolean;
  /** 已實現毛利要不要含業務抽成，見檔案開頭的隱私說明。 */
  canViewCommission: boolean;
  /** 「新增車輛」快速入口要不要顯示——沒有編輯車輛權限的人看不到。 */
  canEditCars: boolean;
  /** 點卡片/快速入口要切到哪個分頁籤——直接呼叫 dashboard-shell.tsx 傳進來
   * 的 setActiveModule，不用整頁導覽（跟側邊欄的 Link 是兩種不同的切換
   * 方式，這裡用 client state 直接切、不需要重新整理頁面）。 */
  onNavigate: (moduleKey: string) => void;
}) {
  const now = new Date();

  // ---------------------------------------------------------------------
  // 在庫（還沒結帳）——跟 analytics-module.tsx 同一套規則：排除軟刪除、
  // 排除已售出，即時用 approved 維修請款金額算整備成本。
  // ---------------------------------------------------------------------
  const activeCars = cars.filter((c) => !c.deleted_at);
  const inventoryCars = activeCars.filter((c) => c.status !== "sold");

  const approvedPrepCostByCar = new Map<string, number>();
  for (const item of repairItems) {
    if (item.status !== "approved") continue;
    approvedPrepCostByCar.set(item.car_id, (approvedPrepCostByCar.get(item.car_id) ?? 0) + Number(item.amount));
  }
  const liveTotalCost = (car: Car) =>
    Number(car.purchase_price) +
    (approvedPrepCostByCar.get(car.id) ?? 0) +
    Number(car.transfer_fee ?? 0) +
    Number(car.tax_amount ?? 0);

  const inventoryCount = inventoryCars.length;
  const inventoryAssetCost = inventoryCars.reduce((sum, c) => sum + liveTotalCost(c), 0);

  // ---------------------------------------------------------------------
  // 本月已結案——跟 analytics-module.tsx 完全一致的月份歸屬規則
  // （closed_at，不是 created_at）。
  // ---------------------------------------------------------------------
  const closedThisMonthCars = activeCars.filter(
    (c) => c.status === "sold" && c.closed_at != null && isThisMonth(c.closed_at, now)
  );
  const soldThisMonthCount = closedThisMonthCars.length;
  const revenueThisMonth = closedThisMonthCars.reduce((sum, c) => sum + Number(c.final_price ?? c.selling_price ?? 0), 0);
  const realizedProfitThisMonth = closedThisMonthCars.reduce((sum, c) => {
    const revenue = c.final_price ?? c.selling_price ?? 0;
    const commissionCost = Number(c.closed_commission_cost ?? 0);
    const cost = Number(c.closed_total_cost ?? 0) - (canViewCommission ? 0 : commissionCost);
    return sum + (Number(revenue) - cost);
  }, 0);

  // ---------------------------------------------------------------------
  // 待處理事項——所有角色都看得到，不涉及金額。
  // ---------------------------------------------------------------------
  const pendingRepairCount = repairItems.filter((r) => r.status === "pending").length;
  const pendingTradeInCount = tradeInRequests.filter((t) => t.status === "new").length;
  const pendingDealCount = deals.filter((d) => d.status !== "delivered").length;
  const newCustomersThisMonth = customers.filter((c) => isThisMonth(c.created_at, now)).length;

  // ---------------------------------------------------------------------
  // 最近估車申請——比照 Hocar 首頁「最近預約」那張卡片，取代「進了系統
  // 才知道有新的估車單」，最新 5 筆。
  // ---------------------------------------------------------------------
  const recentTradeIns = [...tradeInRequests]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-neutral-900">
          {tenantName ? `${tenantName}，今天狀況` : "今天狀況"}
        </h2>
        <p className="mt-1 text-xs text-neutral-400">一眼看完現在要處理什麼，細節請點進對應分頁</p>
      </div>

      {/* 快速操作入口——比照 Hocar 首頁那三顆快捷按鈕，把最常見的「開始
          做一件事」直接放在最上面，不用先想「這個功能在哪個分頁」。 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {canEditCars && (
          <QuickAction
            icon={<IconInventory />}
            title="新增車輛"
            subtitle="上架待售車輛資料"
            onClick={() => onNavigate("inventory")}
          />
        )}
        <QuickAction
          icon={<IconDocument />}
          title="新增合約"
          subtitle="建立買賣合約"
          onClick={() => onNavigate("deals")}
        />
        <QuickAction
          icon={<IconWrench />}
          title="送出維修請款"
          subtitle="登記整備/維修費用"
          onClick={() => onNavigate("maintenance")}
        />
      </div>

      {/* 待處理事項——營運層面的台數/筆數，所有角色都看得到，不涉及金額。 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="在庫車輛數" value={inventoryCount} unit="台" onClick={() => onNavigate("inventory")} />
        <StatCard
          label="待審核請款"
          value={pendingRepairCount}
          unit="筆"
          highlight={pendingRepairCount > 0}
          onClick={() => onNavigate("maintenance")}
        />
        <StatCard
          label="待處理估車"
          value={pendingTradeInCount}
          unit="筆"
          highlight={pendingTradeInCount > 0}
          onClick={() => onNavigate("tradeIns")}
        />
        <StatCard
          label="未交車合約"
          value={pendingDealCount}
          unit="件"
          onClick={() => onNavigate("deals")}
        />
        <StatCard label="本月成交" value={soldThisMonthCount} unit="台" onClick={() => onNavigate("inventory")} />
        <StatCard label="本月新增客戶" value={newCustomersThisMonth} unit="位" onClick={() => onNavigate("crm")} />
      </div>

      {/* 金額類卡片——只有 canViewAnalytics 看得到，跟「車行經營數據看板」
          同一個權限開關，避免首頁把敏感財務資料洩漏給一般員工。 */}
      {canViewAnalytics && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MoneyCard label="本月銷售營業額" value={revenueThisMonth} />
          <MoneyCard
            label="本月已實現毛利"
            value={realizedProfitThisMonth}
            hint={canViewCommission ? undefined : "不含業務抽成"}
          />
          <MoneyCard label="在庫總成本（含整備）" value={inventoryAssetCost} hint="即時計算，尚未結帳" />
        </div>
      )}

      {/* 最近估車申請——比照 Hocar「最近預約」，讓新進來的估車需求不用
          特地點進估車申請分頁才看得到。 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between border-b border-neutral-100 pb-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-neutral-800">
            <span className="flex h-4 w-4 text-neutral-400">
              <IconCar />
            </span>
            最近估車申請
          </h3>
          <button
            type="button"
            onClick={() => onNavigate("tradeIns")}
            className="text-xs font-medium text-[#A6793D] hover:underline"
          >
            查看全部
          </button>
        </div>
        {recentTradeIns.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-400">目前沒有估車申請紀錄</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {recentTradeIns.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-800">
                    {t.name}
                    <span className="ml-2 text-xs font-normal text-neutral-400">{t.phone}</span>
                  </p>
                  <p className="truncate text-xs text-neutral-400">
                    {carDisplayName({ brand: t.brand, model_name: t.model_name ?? "未填車型", year: t.year })}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-neutral-400">{formatDate(t.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-[#BFA074] hover:shadow"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FBF1E4] p-2.5 text-[#A6793D]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-neutral-900">{title}</span>
        <span className="block truncate text-xs text-neutral-400">{subtitle}</span>
      </span>
    </button>
  );
}

function StatCard({
  label,
  value,
  unit,
  highlight,
  onClick,
}: {
  label: string;
  value: number;
  unit: string;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-[#BFA074] hover:shadow"
    >
      <p className="text-xs font-bold text-neutral-500">{label}</p>
      <p className={"mt-1.5 text-2xl font-bold tabular-nums " + (highlight ? "text-[#A6793D]" : "text-neutral-900")}>
        {value}
        <span className="ml-1 text-sm font-medium text-neutral-400">{unit}</span>
      </p>
    </button>
  );
}

function MoneyCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const positive = value >= 0;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-neutral-500">{label}</p>
      <p className={"mt-1.5 text-2xl font-bold tabular-nums " + (positive ? "text-neutral-900" : "text-red-600")}>
        {positive ? "" : "-"}
        {formatCurrency(Math.abs(Math.round(value)))}
      </p>
      {hint && <p className="mt-1 text-[11px] text-neutral-400">{hint}</p>}
    </div>
  );
}
