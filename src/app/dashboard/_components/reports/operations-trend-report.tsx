"use client";

// 「營運報表」——近 12 個月的整體經營趨勢（進貨台數／售出台數／營收／
// 毛利／淨利／整備開銷），用簡單的長條圖呈現一個指標的趨勢，下面搭配
// 完整數字表格，對齊 Hocar 的營運報表（見這次金流架構開頭的競品落差
// 分析）。長條圖風格沿用 analytics-module.tsx「年度整備開銷趨勢」那個
// 手刻 CSS 長條圖，不引入額外的圖表套件。
import { useMemo, useState } from "react";
import type { Car, RepairItem } from "@/lib/supabase/types";
import { formatCurrency, formatNumber, taiwanMonthKey, currentTaiwanMonthKey } from "@/lib/format";
import { downloadCsv } from "@/lib/csv-export";

export type CarTrendSlice = Pick<
  Car,
  | "id"
  | "created_at"
  | "closed_at"
  | "status"
  | "final_price"
  | "closed_total_cost"
  | "closed_commission_cost"
  | "closed_acquisition_bonus_cost"
>;
export type RepairItemTrendSlice = Pick<RepairItem, "id" | "amount" | "status" | "reviewed_at" | "created_at">;

type MonthlyRow = {
  monthKey: string;
  label: string;
  purchasedCount: number;
  soldCount: number;
  revenue: number;
  grossProfit: number;
  netProfit: number;
  prepCost: number;
};

type MetricKey = "revenue" | "grossProfit" | "netProfit" | "purchasedCount" | "soldCount" | "prepCost";

const METRICS: { key: MetricKey; label: string; isCurrency: boolean }[] = [
  { key: "revenue", label: "營收", isCurrency: true },
  { key: "grossProfit", label: "毛利（不含抽成/獎金）", isCurrency: true },
  { key: "netProfit", label: "淨利（含抽成/獎金）", isCurrency: true },
  { key: "purchasedCount", label: "進貨台數", isCurrency: false },
  { key: "soldCount", label: "售出台數", isCurrency: false },
  { key: "prepCost", label: "整備開銷", isCurrency: true },
];

/** 近 12 個月（含本月）的月份 key 清單，由舊到新排列，跟長條圖由左到右
 * 讀取趨勢的直覺一致。 */
function lastTwelveMonthKeys(): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(taiwanMonthKey(d));
  }
  return keys;
}

export function OperationsTrendReport({
  cars,
  repairItems,
  canViewCommission,
}: {
  cars: CarTrendSlice[];
  repairItems: RepairItemTrendSlice[];
  /** 淨利（含業務抽成／收購獎金）有隱私考量，理由跟其餘報表的
   * canViewCommission 完全一樣。 */
  canViewCommission: boolean;
}) {
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const thisMonthKey = currentTaiwanMonthKey();

  const rows: MonthlyRow[] = useMemo(() => {
    const monthKeys = lastTwelveMonthKeys();
    const byMonth = new Map<string, MonthlyRow>(
      monthKeys.map((k) => [
        k,
        {
          monthKey: k,
          label: k.slice(5) + "月",
          purchasedCount: 0,
          soldCount: 0,
          revenue: 0,
          grossProfit: 0,
          netProfit: 0,
          prepCost: 0,
        },
      ])
    );

    for (const car of cars) {
      const purchasedKey = taiwanMonthKey(car.created_at);
      const purchasedRow = byMonth.get(purchasedKey);
      if (purchasedRow) purchasedRow.purchasedCount += 1;

      if (car.status === "sold" && car.closed_at) {
        const soldKey = taiwanMonthKey(car.closed_at);
        const soldRow = byMonth.get(soldKey);
        if (soldRow) {
          const totalCost = Number(car.closed_total_cost ?? 0);
          const commission = Number(car.closed_commission_cost ?? 0);
          const acquisitionBonus = Number(car.closed_acquisition_bonus_cost ?? 0);
          const finalPrice = Number(car.final_price ?? 0);
          soldRow.soldCount += 1;
          soldRow.revenue += finalPrice;
          soldRow.grossProfit += finalPrice - (totalCost - commission - acquisitionBonus);
          soldRow.netProfit += finalPrice - totalCost;
        }
      }
    }

    for (const item of repairItems) {
      if (item.status !== "approved") continue;
      const key = taiwanMonthKey(item.reviewed_at ?? item.created_at);
      const row = byMonth.get(key);
      if (row) row.prepCost += Number(item.amount ?? 0);
    }

    return monthKeys.map((k) => byMonth.get(k)!);
  }, [cars, repairItems]);

  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const maxValue = Math.max(...rows.map((r) => Math.abs(r[metric])), 1);

  function handleExport() {
    const header = ["月份", "進貨台數", "售出台數", "營收", "毛利（不含抽成/獎金）", ...(canViewCommission ? ["淨利（含抽成/獎金）"] : []), "整備開銷"];
    const dataRows = rows.map((r) => [
      r.monthKey,
      r.purchasedCount,
      r.soldCount,
      r.revenue,
      r.grossProfit,
      ...(canViewCommission ? [r.netProfit] : []),
      r.prepCost,
    ]);
    downloadCsv(`營運報表-${thisMonthKey}.csv`, header, dataRows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
          {METRICS.filter((m) => canViewCommission || m.key !== "netProfit").map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={
                "rounded-md px-2.5 py-1 text-xs font-semibold transition " +
                (metric === m.key ? "bg-white text-blue-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800")
              }
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-blue-300 hover:text-blue-700"
        >
          ⬇️ 匯出 CSV
        </button>
      </div>

      {/* 長條圖——沿用 analytics-module.tsx 年度整備開銷趨勢的手刻 CSS
          長條圖風格。 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-neutral-800">近 12 個月・{activeMetric.label}</h3>
        <div className="flex items-end gap-1.5 sm:gap-2">
          {rows.map((r) => {
            const value = r[metric];
            return (
              <div key={r.monthKey} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-neutral-400">
                  {value === 0
                    ? ""
                    : activeMetric.isCurrency
                      ? formatNumber(Math.round(value / 1000)) + "k"
                      : formatNumber(value)}
                </span>
                <div
                  className={"w-full rounded-t-md " + (r.monthKey === thisMonthKey ? "bg-[#BFA074]" : "bg-[#E7DAC3]")}
                  style={{ height: `${Math.max(4, (Math.abs(value) / maxValue) * 120)}px` }}
                />
                <span className="text-[10px] text-neutral-400">{r.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 完整數字表格 */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">月份</th>
              <th className="px-4 py-2 text-right font-medium">進貨台數</th>
              <th className="px-4 py-2 text-right font-medium">售出台數</th>
              <th className="px-4 py-2 text-right font-medium">營收</th>
              <th className="px-4 py-2 text-right font-medium">毛利</th>
              {canViewCommission && <th className="px-4 py-2 text-right font-medium">淨利</th>}
              <th className="px-4 py-2 text-right font-medium">整備開銷</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <tr key={r.monthKey} className={"hover:bg-neutral-50 " + (r.monthKey === thisMonthKey ? "bg-[#FBF1E4]/40" : "")}>
                <td className="whitespace-nowrap px-4 py-2 text-neutral-800">{r.monthKey}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{r.purchasedCount} 輛</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{r.soldCount} 輛</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-800">{formatCurrency(r.revenue)}</td>
                <td
                  className={
                    "whitespace-nowrap px-4 py-2 text-right font-semibold " +
                    (r.grossProfit >= 0 ? "text-emerald-600" : "text-red-600")
                  }
                >
                  {formatCurrency(r.grossProfit)}
                </td>
                {canViewCommission && (
                  <td
                    className={
                      "whitespace-nowrap px-4 py-2 text-right font-semibold " +
                      (r.netProfit >= 0 ? "text-emerald-600" : "text-red-600")
                    }
                  >
                    {formatCurrency(r.netProfit)}
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(r.prepCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
