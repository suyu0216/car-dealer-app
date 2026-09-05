"use client";

// 「報表分析」共用的日期區間篩選按鈕列（本月／上月／自訂／全部），跟
// financial-accounts-module.tsx 收支明細的日期篩選 UI 同一套視覺風格。
import type { DateRangePreset } from "@/lib/report-date-range";

const PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "thisMonth", label: "本月" },
  { key: "lastMonth", label: "上月" },
  { key: "custom", label: "自訂" },
];

export function DateRangeFilter({
  preset,
  onPresetChange,
  customStart,
  onCustomStartChange,
  customEnd,
  onCustomEndChange,
}: {
  preset: DateRangePreset;
  onPresetChange: (p: DateRangePreset) => void;
  customStart: string;
  onCustomStartChange: (v: string) => void;
  customEnd: string;
  onCustomEndChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPresetChange(p.key)}
            className={
              "rounded-md px-2.5 py-1 text-xs font-semibold transition " +
              (preset === p.key ? "bg-white text-blue-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800")
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5 text-xs">
          <input
            type="date"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
          />
          <span className="text-neutral-400">～</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
