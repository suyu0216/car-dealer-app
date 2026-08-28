import type { Car, Deal, RepairItem } from "@/lib/supabase/types";
import { formatCurrency, formatNumber, taiwanDateParts } from "@/lib/format";

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// 「本月/今年」一律用台灣時間判斷，不是程式碼實際執行環境（伺服器/瀏覽器）
// 的系統時區——見 src/lib/format.ts 的 taiwanDateParts() 說明。
function isThisMonth(iso: string, now: Date) {
  const a = taiwanDateParts(iso);
  const b = taiwanDateParts(now);
  return a.year === b.year && a.month === b.month;
}

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

export function AnalyticsModule({
  cars,
  repairItems,
  deals,
  staff,
}: {
  cars: Car[];
  repairItems: RepairItem[];
  deals: Deal[];
  staff: { id: string; name: string | null }[];
}) {
  const now = new Date();

  // ---------------------------------------------------------------------
  // 卡片一：場內在庫營運狀況 —— 只看「還沒結帳」的車輛，即時計算。
  // ---------------------------------------------------------------------
  const inventoryCars = cars.filter((c) => c.status !== "sold");

  const approvedPrepCostByCar = new Map<string, number>();
  for (const item of repairItems) {
    if (item.status !== "approved") continue;
    approvedPrepCostByCar.set(
      item.car_id,
      (approvedPrepCostByCar.get(item.car_id) ?? 0) + Number(item.amount)
    );
  }
  const livePrepCost = (car: Car) => approvedPrepCostByCar.get(car.id) ?? 0;
  const liveTotalCost = (car: Car) =>
    Number(car.purchase_price) + livePrepCost(car) + Number(car.transfer_fee ?? 0);

  const inventoryCount = inventoryCars.length;
  const inventoryAssetCost = inventoryCars.reduce((sum, c) => sum + liveTotalCost(c), 0);
  const inventorySpentPrepCost = inventoryCars.reduce((sum, c) => sum + livePrepCost(c), 0);
  const inventoryEstimatedMargin = inventoryCars
    .filter((c) => c.selling_price != null)
    .reduce((sum, c) => sum + (Number(c.selling_price) - liveTotalCost(c)), 0);

  // ---------------------------------------------------------------------
  // 卡片二：本月已結案銷售績效 —— 只看「已結帳」的車輛（closed_at 非
  // null），一律讀結帳當下封存的 closed_prep_cost / closed_total_cost，
  // 不會被之後新核准的維修請款影響（見 cars-actions.ts 的
  // computeClosingFields()）。全部指標都只看「本月」結帳的車輛。
  // ---------------------------------------------------------------------
  const closedThisMonthCars = cars.filter(
    (c) => c.status === "sold" && c.closed_at != null && isThisMonth(c.closed_at, now)
  );

  const soldThisMonthCount = closedThisMonthCars.length;

  const realizedProfitThisMonth = closedThisMonthCars.reduce((sum, c) => {
    const revenue = c.final_price ?? c.selling_price ?? 0;
    const cost = Number(c.closed_total_cost ?? 0);
    return sum + (Number(revenue) - cost);
  }, 0);

  const turnoverDays = closedThisMonthCars
    .map((c) => daysBetween(new Date(c.created_at), new Date(c.closed_at!)))
    .filter((d) => Number.isFinite(d) && d >= 0);
  const avgTurnoverDays =
    turnoverDays.length > 0
      ? Math.round(turnoverDays.reduce((a, b) => a + b, 0) / turnoverDays.length)
      : null;

  // 業務銷售排行榜：本月已簽約/已交車的合約，依承辦業務加總。
  const completedDealsThisMonth = deals.filter(
    (d) => (d.status === "signed" || d.status === "delivered") && isThisMonth(d.created_at, now)
  );
  const leaderboardMap = new Map<string, { count: number; total: number }>();
  for (const deal of completedDealsThisMonth) {
    const key = deal.salesperson_id ?? "unassigned";
    const entry = leaderboardMap.get(key) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(deal.final_price);
    leaderboardMap.set(key, entry);
  }
  const staffNameById = new Map(staff.map((s) => [s.id, s.name ?? "未命名"]));
  const leaderboard = Array.from(leaderboardMap.entries())
    .map(([id, stat]) => ({
      name: id === "unassigned" ? "未指定業務" : (staffNameById.get(id) ?? "已離職員工"),
      ...stat,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // ---------------------------------------------------------------------
  // 卡片三：年度整備／維修開銷 —— 只算「已核准撥款」的維修請款
  // （repair_items.status === 'approved'，待審核/已退回不算真的花出去的
  // 錢），依審核通過日期（reviewed_at；缺這個時間戳的舊資料退回用
  // created_at，避免整筆從圖表消失）分月加總，看得出每個月維修支出的
  // 趨勢，不只是單月數字。
  // ---------------------------------------------------------------------
  const currentYear = taiwanDateParts(now).year;
  // taiwanDateParts().month 是 1-12（不是 JS Date 慣用的 0-based），這裡
  // 減 1 換成陣列 index，跟下面 monthlyRepairCost[月 - 1] 是同一套換算。
  const currentMonthIndex = taiwanDateParts(now).month - 1;
  const approvedThisYear = repairItems.filter((r) => {
    if (r.status !== "approved") return false;
    return taiwanDateParts(r.reviewed_at ?? r.created_at).year === currentYear;
  });
  const monthlyRepairCost = Array.from({ length: 12 }, () => 0);
  for (const item of approvedThisYear) {
    const month = taiwanDateParts(item.reviewed_at ?? item.created_at).month;
    monthlyRepairCost[month - 1] += Number(item.amount);
  }
  const yearlyRepairTotal = monthlyRepairCost.reduce((sum, v) => sum + v, 0);
  const maxMonthlyRepairCost = Math.max(1, ...monthlyRepairCost);

  return (
    <section className="space-y-5">
      <h2 className="text-base font-semibold text-neutral-800">車行經營數據看板</h2>

      {/* 📌 場內在庫營運狀況 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden>📌</span>
          <h3 className="text-sm font-semibold text-neutral-800">場內在庫營運狀況</h3>
        </div>
        <p className="mt-0.5 text-xs text-neutral-400">
          僅統計待售中／整備中／已預訂的車輛，即時計算
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="場內台數" value={`${inventoryCount} 輛`} />
          <Stat label="場內在庫總資產" value={formatCurrency(inventoryAssetCost)} />
          <Stat label="已花整備費" value={formatCurrency(inventorySpentPrepCost)} />
          <Stat
            label="場內預估毛利"
            value={formatCurrency(inventoryEstimatedMargin)}
            tone={inventoryEstimatedMargin >= 0 ? "positive" : "negative"}
          />
        </div>
      </div>

      {/* 💰 本月已結案銷售績效 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden>💰</span>
          <h3 className="text-sm font-semibold text-neutral-800">本月已結案銷售績效</h3>
        </div>
        <p className="mt-0.5 text-xs text-neutral-400">
          僅統計本月售出結帳的車輛，成本讀取售出當下封存的快照
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="本月成交台數" value={`${soldThisMonthCount} 輛`} />
          <Stat
            label="已實現總毛利/淨利"
            value={formatCurrency(realizedProfitThisMonth)}
            tone={realizedProfitThisMonth >= 0 ? "positive" : "negative"}
          />
          <Stat
            label="平均庫存週轉天數"
            value={avgTurnoverDays != null ? `${avgTurnoverDays} 天` : "—"}
          />
        </div>

        <div className="mt-5 border-t border-neutral-100 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            業務銷售排行榜（本月）
          </h4>
          {leaderboard.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">本月尚無已簽約/已交車的合約</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {leaderboard.map((entry, i) => (
                <li key={entry.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#BFA074]/15 text-xs font-medium text-[#A6793D]">
                      {i + 1}
                    </span>
                    <span className="text-neutral-700">{entry.name}</span>
                  </span>
                  <span className="text-right">
                    <span className="font-semibold tabular-nums text-neutral-800">
                      {formatCurrency(entry.total)}
                    </span>
                    <span className="ml-1.5 text-xs text-neutral-400">{entry.count} 台</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* 🛠️ 年度整備／維修開銷 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden>🛠️</span>
          <h3 className="text-sm font-semibold text-neutral-800">{currentYear} 年度整備／維修開銷</h3>
        </div>
        <p className="mt-0.5 text-xs text-neutral-400">
          僅統計已核准撥款的維修請款，依審核通過月份分月加總
        </p>

        <div className="mt-4">
          <Stat label={`${currentYear} 年累計已撥款`} value={formatCurrency(yearlyRepairTotal)} />
        </div>

        {yearlyRepairTotal === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">今年還沒有已核准撥款的維修請款紀錄</p>
        ) : (
          <div className="mt-4 flex items-end gap-1.5 sm:gap-2">
            {monthlyRepairCost.map((amount, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-neutral-400">
                  {amount > 0 ? formatNumber(Math.round(amount / 1000)) + "k" : ""}
                </span>
                <div
                  className={
                    "w-full rounded-t-md " + (i === currentMonthIndex ? "bg-[#BFA074]" : "bg-[#E7DAC3]")
                  }
                  style={{ height: `${Math.max(4, (amount / maxMonthlyRepairCost) * 96)}px` }}
                />
                <span className="text-[10px] text-neutral-400">{MONTH_LABELS[i]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3">
      <p className="text-[11px] font-medium text-neutral-500">{label}</p>
      <p
        className={
          "mt-1 text-lg font-semibold tabular-nums " +
          (tone === "positive"
            ? "text-[#5F7563]"
            : tone === "negative"
              ? "text-[#B75454]"
              : "text-neutral-800")
        }
      >
        {value}
      </p>
    </div>
  );
}
