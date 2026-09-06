"use client";

// 「單台車結算報表」——每一台已結案（賣出並結帳封存）車輛的完整財務
// 拆解：收購成本／整備成本／過戶費／稅金／（業務抽成）／（收購獎金）／
// 總成本／成交金額／毛利／淨利，一台車一列，對齊 Hocar 的「單台車結算
// 報表」（見這次金流架構開頭的競品落差分析）。全部讀 cars 表結帳當下
// 封存的快照欄位（closed_*），不受之後任何異動影響，理由跟
// analytics-module.tsx／profit-share-module.tsx 讀同一批快照欄位的原因
// 一致。2026-09-06 新增收購獎金（撥給收購／採購人）——跟業務抽成同一個
// 隱私層級，一起用 canViewCommission 控制要不要顯示、要不要算進淨利。
import { useMemo, useState } from "react";
import type { Car } from "@/lib/supabase/types";
import { formatCurrency, formatDate, currentTaiwanDateKey } from "@/lib/format";
import { downloadCsv } from "@/lib/csv-export";
import { type DateRangePreset, resolveRange, isInRange } from "@/lib/report-date-range";
import { DateRangeFilter } from "./date-range-filter";

export type CarSettlementSlice = Pick<
  Car,
  | "id"
  | "brand"
  | "model_name"
  | "license_plate"
  | "purchase_price"
  | "floor_price"
  | "closed_prep_cost"
  | "transfer_fee"
  | "tax_amount"
  | "closed_commission_cost"
  | "closed_acquisition_bonus_cost"
  | "closed_total_cost"
  | "final_price"
  | "closed_at"
  | "status"
>;

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "neutral" }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-[11px] font-medium text-neutral-400">{label}</p>
      <p
        className={
          "mt-1 text-lg font-bold " +
          (tone === "up" ? "text-emerald-600" : tone === "down" ? "text-red-600" : "text-neutral-900")
        }
      >
        {value}
      </p>
    </div>
  );
}

export function CarSettlementReport({
  cars,
  canViewCommission,
  canViewFinalCost,
}: {
  cars: CarSettlementSlice[];
  /** 淨利（含業務抽成／收購獎金）跟這兩個欄位本身有隱私考量，只有
   * canViewAllSalary 或 canManageFinance 的人看得到，理由跟
   * analytics-module.tsx 的 canViewCommission 完全一樣。 */
  canViewCommission: boolean;
  /** 2026-09-06 新增：「底價基準淨利」欄位的顯示權限——比 canViewCommission
   * 更嚴格，只有會計/老闆（canViewFinalCost）看得到，理由跟
   * deal-form-modal.tsx「底價與收購進價差額」一樣（間接透露議價空間）。 */
  canViewFinalCost: boolean;
}) {
  const [preset, setPreset] = useState<DateRangePreset>("thisMonth");
  const [customStart, setCustomStart] = useState(() => currentTaiwanDateKey());
  const [customEnd, setCustomEnd] = useState(() => currentTaiwanDateKey());
  const range = resolveRange(preset, customStart, customEnd);

  const rows = useMemo(() => {
    return cars
      .filter((c) => c.status === "sold" && c.closed_at && isInRange(c.closed_at, range))
      .map((c) => {
        const totalCost = Number(c.closed_total_cost ?? 0);
        const commission = Number(c.closed_commission_cost ?? 0);
        const acquisitionBonus = Number(c.closed_acquisition_bonus_cost ?? 0);
        const finalPrice = Number(c.final_price ?? 0);
        const grossProfit = finalPrice - (totalCost - commission - acquisitionBonus);
        const netProfit = finalPrice - totalCost;
        // 2026-09-06 新增：「底價基準淨利」——成本改用「底價」
        // （floor_price）取代實際收購價，反映「照計畫底價進貨應該有多少
        // 淨利」，不受個別議價結果影響；沒填底價的車輛自動退回用實際
        // 收購價（等同一般淨利），見檔案開頭跟 overview-module.tsx 的
        // 說明——這兩處刻意用同一套公式，安安要能先在這裡核對每台車的
        // 金額，儀表板加總才會跟這裡對得起來。
        const floorCostBasis = Number(c.floor_price ?? c.purchase_price);
        const floorBasedTotalCost =
          floorCostBasis + Number(c.closed_prep_cost ?? 0) + Number(c.transfer_fee ?? 0) + Number(c.tax_amount ?? 0) + commission + acquisitionBonus;
        const floorBasedNetProfit = finalPrice - floorBasedTotalCost;
        return { ...c, totalCost, commission, acquisitionBonus, finalPrice, grossProfit, netProfit, floorBasedNetProfit };
      })
      .sort((a, b) => (a.closed_at! < b.closed_at! ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, range.start, range.end]);

  const totals = rows.reduce(
    (acc, r) => ({
      final: acc.final + r.finalPrice,
      cost: acc.cost + r.totalCost,
      gross: acc.gross + r.grossProfit,
      net: acc.net + r.netProfit,
      floorNet: acc.floorNet + r.floorBasedNetProfit,
    }),
    { final: 0, cost: 0, gross: 0, net: 0, floorNet: 0 }
  );

  function handleExport() {
    const header = [
      "結案日期",
      "車輛",
      "車牌",
      "收購成本",
      "整備成本",
      "過戶費",
      "稅金",
      ...(canViewCommission ? ["業務抽成", "收購獎金"] : []),
      "總成本",
      "成交金額",
      "毛利",
      ...(canViewCommission ? ["淨利"] : []),
      ...(canViewFinalCost ? ["淨利（底價基準）"] : []),
    ];
    const dataRows = rows.map((r) => [
      r.closed_at?.slice(0, 10) ?? "",
      `${r.brand ?? ""} ${r.model_name}`.trim(),
      r.license_plate ?? "",
      r.purchase_price,
      r.closed_prep_cost ?? 0,
      r.transfer_fee ?? 0,
      r.tax_amount ?? 0,
      ...(canViewCommission ? [r.commission, r.acquisitionBonus] : []),
      r.totalCost,
      r.finalPrice,
      r.grossProfit,
      ...(canViewCommission ? [r.netProfit] : []),
      ...(canViewFinalCost ? [r.floorBasedNetProfit] : []),
    ]);
    downloadCsv(`單台車結算報表-最終成本表-${currentTaiwanDateKey()}.csv`, header, dataRows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateRangeFilter
          preset={preset}
          onPresetChange={setPreset}
          customStart={customStart}
          onCustomStartChange={setCustomStart}
          customEnd={customEnd}
          onCustomEndChange={setCustomEnd}
        />
        <button
          type="button"
          onClick={handleExport}
          disabled={rows.length === 0}
          className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⬇️ 匯出 CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="結案台數" value={`${rows.length} 輛`} />
        <StatCard label="成交金額合計" value={formatCurrency(totals.final)} />
        <StatCard label="毛利合計（不含抽成/獎金）" value={formatCurrency(totals.gross)} tone={totals.gross >= 0 ? "up" : "down"} />
        {canViewCommission && (
          <StatCard label="淨利合計（含抽成/獎金）" value={formatCurrency(totals.net)} tone={totals.net >= 0 ? "up" : "down"} />
        )}
        {/* 2026-09-06 新增：底價基準淨利合計，只有會計/老闆看得到，見檔案
            開頭的說明。首頁儀表板「本月已實現淨利（底價基準）」用同一套
            公式加總，這裡跟那裡的數字應該對得起來，方便安安核對。 */}
        {canViewFinalCost && (
          <StatCard
            label="淨利合計（底價基準）"
            value={formatCurrency(totals.floorNet)}
            tone={totals.floorNet >= 0 ? "up" : "down"}
          />
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">結案日期</th>
              <th className="px-4 py-2 font-medium">車輛</th>
              <th className="px-4 py-2 text-right font-medium">收購成本</th>
              <th className="px-4 py-2 text-right font-medium">整備成本</th>
              <th className="px-4 py-2 text-right font-medium">過戶費</th>
              <th className="px-4 py-2 text-right font-medium">稅金</th>
              {canViewCommission && <th className="px-4 py-2 text-right font-medium">業務抽成</th>}
              {canViewCommission && <th className="px-4 py-2 text-right font-medium">收購獎金</th>}
              <th className="px-4 py-2 text-right font-medium">總成本</th>
              <th className="px-4 py-2 text-right font-medium">成交金額</th>
              <th className="px-4 py-2 text-right font-medium">毛利</th>
              {canViewCommission && <th className="px-4 py-2 text-right font-medium">淨利</th>}
              {canViewFinalCost && <th className="px-4 py-2 text-right font-medium">淨利（底價基準）</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={9 + (canViewCommission ? 2 : 0) + (canViewFinalCost ? 1 : 0)}
                  className="px-4 py-8 text-center text-neutral-400"
                >
                  這段期間沒有結案車輛
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-500">{formatDate(r.closed_at)}</td>
                <td className="px-4 py-2 text-neutral-800">
                  {r.brand ? `${r.brand} ` : ""}
                  {r.model_name}
                  {r.license_plate && <span className="ml-1.5 text-xs text-neutral-400">{r.license_plate}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(r.purchase_price)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(r.closed_prep_cost ?? 0)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(r.transfer_fee ?? 0)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(r.tax_amount ?? 0)}</td>
                {canViewCommission && (
                  <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(r.commission)}</td>
                )}
                {canViewCommission && (
                  <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(r.acquisitionBonus)}</td>
                )}
                <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-neutral-800">{formatCurrency(r.totalCost)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-neutral-800">{formatCurrency(r.finalPrice)}</td>
                <td
                  className={
                    "whitespace-nowrap px-4 py-2 text-right font-bold " +
                    (r.grossProfit >= 0 ? "text-emerald-600" : "text-red-600")
                  }
                >
                  {formatCurrency(r.grossProfit)}
                </td>
                {canViewCommission && (
                  <td
                    className={
                      "whitespace-nowrap px-4 py-2 text-right font-bold " +
                      (r.netProfit >= 0 ? "text-emerald-600" : "text-red-600")
                    }
                  >
                    {formatCurrency(r.netProfit)}
                  </td>
                )}
                {canViewFinalCost && (
                  <td
                    className={
                      "whitespace-nowrap px-4 py-2 text-right font-bold " +
                      (r.floorBasedNetProfit >= 0 ? "text-emerald-600" : "text-red-600")
                    }
                  >
                    {formatCurrency(r.floorBasedNetProfit)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
