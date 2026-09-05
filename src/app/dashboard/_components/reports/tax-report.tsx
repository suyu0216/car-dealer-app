"use client";

// 「稅金報表」——列出每台車登記的稅金／發票稅金（cars.tax_amount），依
// 車輛入庫日期（created_at）篩選期間，給報稅／對帳用，對齊 Hocar 的稅金
// 報表（見這次金流架構開頭的競品落差分析）。不分車輛是否已售出——稅金
// 通常在收購/過戶當下就已經發生，不用等車賣掉才列進來。
import { useMemo, useState } from "react";
import type { Car } from "@/lib/supabase/types";
import { formatCurrency, formatDate, currentTaiwanDateKey } from "@/lib/format";
import { downloadCsv } from "@/lib/csv-export";
import { type DateRangePreset, resolveRange, isInRange } from "@/lib/report-date-range";
import { DateRangeFilter } from "./date-range-filter";

export type CarTaxSlice = Pick<
  Car,
  "id" | "brand" | "model_name" | "license_plate" | "tax_amount" | "created_at" | "status"
>;

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-[11px] font-medium text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-neutral-900">{value}</p>
    </div>
  );
}

export function TaxReport({ cars }: { cars: CarTaxSlice[] }) {
  const [preset, setPreset] = useState<DateRangePreset>("thisMonth");
  const [customStart, setCustomStart] = useState(() => currentTaiwanDateKey());
  const [customEnd, setCustomEnd] = useState(() => currentTaiwanDateKey());
  const range = resolveRange(preset, customStart, customEnd);

  const rows = useMemo(() => {
    return cars
      .filter((c) => Number(c.tax_amount ?? 0) > 0 && isInRange(c.created_at, range))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, range.start, range.end]);

  const total = rows.reduce((sum, r) => sum + Number(r.tax_amount ?? 0), 0);

  function handleExport() {
    const header = ["入庫日期", "車輛", "車牌", "狀態", "稅金金額"];
    const dataRows = rows.map((r) => [
      r.created_at.slice(0, 10),
      `${r.brand ?? ""} ${r.model_name}`.trim(),
      r.license_plate ?? "",
      r.status === "sold" ? "已售出" : "在庫",
      Number(r.tax_amount ?? 0),
    ]);
    downloadCsv(`稅金報表-${currentTaiwanDateKey()}.csv`, header, dataRows);
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
        <StatCard label="有稅金紀錄的車輛" value={`${rows.length} 輛`} />
        <StatCard label="稅金合計" value={formatCurrency(total)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">入庫日期</th>
              <th className="px-4 py-2 font-medium">車輛</th>
              <th className="px-4 py-2 font-medium">狀態</th>
              <th className="px-4 py-2 text-right font-medium">稅金金額</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  這段期間沒有登記稅金的車輛
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-500">{formatDate(r.created_at)}</td>
                <td className="px-4 py-2 text-neutral-800">
                  {r.brand ? `${r.brand} ` : ""}
                  {r.model_name}
                  {r.license_plate && <span className="ml-1.5 text-xs text-neutral-400">{r.license_plate}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <span
                    className={
                      "rounded px-2 py-1 text-xs font-semibold " +
                      (r.status === "sold" ? "bg-neutral-100 text-neutral-500" : "bg-emerald-50 text-emerald-700")
                    }
                  >
                    {r.status === "sold" ? "已售出" : "在庫"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-neutral-800">
                  {formatCurrency(Number(r.tax_amount ?? 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
