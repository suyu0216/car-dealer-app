"use client";

// 「未售車整備成本報表」——目前還在庫（還沒賣出結帳）的車輛，各自已經
// 花了多少整備／維修成本（只算已核准撥款的請款），跟收購成本的佔比，
// 對齊 Hocar 的整備成本報表（見這次金流架構開頭的競品落差分析）。用途：
// 抓出「整備費已經花超多、卻還沒賣出去」的車輛，提醒盡快處理／檢討進價。
// 即時計算，不用日期區間篩選——這是「現在庫存狀況」的即時快照，不是
// 某段期間的歷史報表。
import { useMemo, useState } from "react";
import type { Car, RepairItem } from "@/lib/supabase/types";
import { formatCurrency, currentTaiwanDateKey } from "@/lib/format";
import { downloadCsv } from "@/lib/csv-export";

export type CarPrepCostSlice = Pick<
  Car,
  "id" | "brand" | "model_name" | "license_plate" | "purchase_price" | "created_at" | "status"
>;
export type RepairItemPrepSlice = Pick<RepairItem, "id" | "car_id" | "amount" | "status">;

type SortKey = "prepCost" | "ratio" | "days";

// 整備成本超過收購成本這個比例，畫面上標示「整備成本偏高」提醒——沒有
// 標準答案，30% 是一個常見的警戒線，讓使用者自己判斷要不要處理。
const HIGH_RATIO_THRESHOLD = 0.3;

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export function UnsoldPrepCostReport({
  cars,
  repairItems,
}: {
  cars: CarPrepCostSlice[];
  repairItems: RepairItemPrepSlice[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("prepCost");
  const now = new Date();

  const prepCostByCarId = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of repairItems) {
      if (item.status !== "approved") continue;
      map.set(item.car_id, (map.get(item.car_id) ?? 0) + Number(item.amount ?? 0));
    }
    return map;
  }, [repairItems]);

  const rows = useMemo(() => {
    const list = cars
      .filter((c) => c.status !== "sold")
      .map((c) => {
        const prepCost = prepCostByCarId.get(c.id) ?? 0;
        const purchasePrice = Number(c.purchase_price ?? 0);
        const ratio = purchasePrice > 0 ? prepCost / purchasePrice : 0;
        const days = daysBetween(new Date(c.created_at), now);
        return { ...c, prepCost, ratio, days };
      });
    const sorted = [...list].sort((a, b) => {
      if (sortKey === "prepCost") return b.prepCost - a.prepCost;
      if (sortKey === "ratio") return b.ratio - a.ratio;
      return b.days - a.days;
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, prepCostByCarId, sortKey]);

  const totals = rows.reduce(
    (acc, r) => ({ purchase: acc.purchase + Number(r.purchase_price ?? 0), prep: acc.prep + r.prepCost }),
    { purchase: 0, prep: 0 }
  );
  const highRatioCount = rows.filter((r) => r.ratio > HIGH_RATIO_THRESHOLD).length;

  function handleExport() {
    const header = ["車輛", "車牌", "收購成本", "累計整備成本", "佔比", "在庫天數"];
    const dataRows = rows.map((r) => [
      `${r.brand ?? ""} ${r.model_name}`.trim(),
      r.license_plate ?? "",
      Number(r.purchase_price ?? 0),
      r.prepCost,
      `${(r.ratio * 100).toFixed(1)}%`,
      r.days,
    ]);
    downloadCsv(`未售車整備成本報表-${currentTaiwanDateKey()}.csv`, header, dataRows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
          {(
            [
              { key: "prepCost", label: "依整備成本排序" },
              { key: "ratio", label: "依佔比排序" },
              { key: "days", label: "依在庫天數排序" },
            ] as { key: SortKey; label: string }[]
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortKey(opt.key)}
              className={
                "rounded-md px-2.5 py-1 text-xs font-semibold transition " +
                (sortKey === opt.key ? "bg-white text-blue-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
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
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-[11px] font-medium text-neutral-400">在庫車輛</p>
          <p className="mt-1 text-lg font-bold text-neutral-900">{rows.length} 輛</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-[11px] font-medium text-neutral-400">在庫整備成本合計</p>
          <p className="mt-1 text-lg font-bold text-neutral-900">{formatCurrency(totals.prep)}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-[11px] font-medium text-neutral-400">在庫總資產（收購+整備）</p>
          <p className="mt-1 text-lg font-bold text-neutral-900">{formatCurrency(totals.purchase + totals.prep)}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-[11px] font-medium text-neutral-400">整備成本偏高（&gt;{HIGH_RATIO_THRESHOLD * 100}%）</p>
          <p className={"mt-1 text-lg font-bold " + (highRatioCount > 0 ? "text-red-600" : "text-neutral-900")}>
            {highRatioCount} 輛
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">車輛</th>
              <th className="px-4 py-2 text-right font-medium">收購成本</th>
              <th className="px-4 py-2 text-right font-medium">累計整備成本</th>
              <th className="px-4 py-2 text-right font-medium">佔比</th>
              <th className="px-4 py-2 text-right font-medium">在庫天數</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  目前沒有在庫車輛
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isHighRatio = r.ratio > HIGH_RATIO_THRESHOLD;
              return (
                <tr key={r.id} className={"hover:bg-neutral-50 " + (isHighRatio ? "bg-red-50/40" : "")}>
                  <td className="px-4 py-2 text-neutral-800">
                    {r.brand ? `${r.brand} ` : ""}
                    {r.model_name}
                    {r.license_plate && <span className="ml-1.5 text-xs text-neutral-400">{r.license_plate}</span>}
                    {isHighRatio && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        整備成本偏高
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(Number(r.purchase_price ?? 0))}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-neutral-800">{formatCurrency(r.prepCost)}</td>
                  <td
                    className={
                      "whitespace-nowrap px-4 py-2 text-right font-bold " + (isHighRatio ? "text-red-600" : "text-neutral-600")
                    }
                  >
                    {(r.ratio * 100).toFixed(1)}%
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{r.days} 天</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
