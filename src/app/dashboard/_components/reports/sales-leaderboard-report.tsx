"use client";

// 「業務報表」——依業務員分組的銷售排行榜，可選日期區間（不像
// analytics-module.tsx 裡那個固定只看「本月」的迷你排行榜），對齊
// Hocar 的業務報表（見這次金流架構開頭的競品落差分析）。只算真正
// 「已交車」的合約——草約/已簽約都還沒真的成交，不該算進業績。
import { useMemo, useState } from "react";
import type { Deal } from "@/lib/supabase/types";
import { formatCurrency, currentTaiwanDateKey } from "@/lib/format";
import { downloadCsv } from "@/lib/csv-export";
import { type DateRangePreset, resolveRange, isInRange } from "@/lib/report-date-range";
import { DateRangeFilter } from "./date-range-filter";

export type SalesLeaderboardDealSlice = Pick<
  Deal,
  "id" | "salesperson_id" | "final_price" | "commission_amount" | "status" | "created_at" | "delivered_at"
>;

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-[11px] font-medium text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-neutral-900">{value}</p>
    </div>
  );
}

export function SalesLeaderboardReport({
  deals,
  staff,
  canViewCommission,
}: {
  deals: SalesLeaderboardDealSlice[];
  staff: { id: string; name: string | null }[];
  canViewCommission: boolean;
}) {
  const [preset, setPreset] = useState<DateRangePreset>("thisMonth");
  const [customStart, setCustomStart] = useState(() => currentTaiwanDateKey());
  const [customEnd, setCustomEnd] = useState(() => currentTaiwanDateKey());
  const range = resolveRange(preset, customStart, customEnd);

  const staffNameById = useMemo(() => new Map(staff.map((s) => [s.id, s.name ?? "（未命名）"])), [staff]);

  const deliveredDeals = useMemo(() => {
    return deals.filter((d) => d.status === "delivered" && isInRange(d.delivered_at ?? d.created_at, range));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, range.start, range.end]);

  const leaderboard = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number; commission: number }>();
    for (const deal of deliveredDeals) {
      const key = deal.salesperson_id ?? "__unassigned__";
      const name = deal.salesperson_id ? (staffNameById.get(deal.salesperson_id) ?? "（已離職員工）") : "未指定業務";
      const entry = map.get(key) ?? { name, count: 0, revenue: 0, commission: 0 };
      entry.count += 1;
      entry.revenue += Number(deal.final_price ?? 0);
      entry.commission += Number(deal.commission_amount ?? 0);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [deliveredDeals, staffNameById]);

  const totals = deliveredDeals.reduce(
    (acc, d) => ({
      count: acc.count + 1,
      revenue: acc.revenue + Number(d.final_price ?? 0),
      commission: acc.commission + Number(d.commission_amount ?? 0),
    }),
    { count: 0, revenue: 0, commission: 0 }
  );
  const avgTicket = totals.count > 0 ? totals.revenue / totals.count : 0;

  function handleExport() {
    const header = canViewCommission
      ? ["業務", "成交台數", "業績金額", "業務抽成"]
      : ["業務", "成交台數", "業績金額"];
    const rows = leaderboard.map((e) =>
      canViewCommission ? [e.name, e.count, e.revenue, e.commission] : [e.name, e.count, e.revenue]
    );
    downloadCsv(`業務報表-${currentTaiwanDateKey()}.csv`, header, rows);
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
          disabled={leaderboard.length === 0}
          className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⬇️ 匯出 CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="總成交台數" value={`${totals.count} 輛`} />
        <StatCard label="總業績金額" value={formatCurrency(totals.revenue)} />
        <StatCard label="平均客單價" value={formatCurrency(avgTicket)} />
        {canViewCommission && <StatCard label="總業務抽成" value={formatCurrency(totals.commission)} />}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">名次</th>
              <th className="px-4 py-2 font-medium">業務</th>
              <th className="px-4 py-2 text-right font-medium">成交台數</th>
              <th className="px-4 py-2 text-right font-medium">業績金額</th>
              {canViewCommission && <th className="px-4 py-2 text-right font-medium">業務抽成</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {leaderboard.length === 0 && (
              <tr>
                <td colSpan={canViewCommission ? 5 : 4} className="px-4 py-8 text-center text-neutral-400">
                  這段期間沒有已交車的合約
                </td>
              </tr>
            )}
            {leaderboard.map((entry, i) => (
              <tr key={entry.name + i} className="hover:bg-neutral-50">
                <td className="whitespace-nowrap px-4 py-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#BFA074]/15 text-xs font-medium text-[#A6793D]">
                    {i + 1}
                  </span>
                </td>
                <td className="px-4 py-2 text-neutral-800">{entry.name}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{entry.count} 輛</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-neutral-800">
                  {formatCurrency(entry.revenue)}
                </td>
                {canViewCommission && (
                  <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(entry.commission)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
