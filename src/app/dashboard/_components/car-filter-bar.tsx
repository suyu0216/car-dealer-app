"use client";

import type { Car } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";
import { STATUS_LABEL, STATUS_OPTIONS } from "./car-status-badge";

export interface CarFilters {
  keyword: string;
  brand: string; // "all" | 特定廠牌
  status: "all" | Car["status"];
  priceMin: number;
  priceMax: number;
  yearMin: string;
  yearMax: string;
  mileageMax: string;
}

export function defaultCarFilters(priceMin: number, priceMax: number): CarFilters {
  return {
    keyword: "",
    brand: "all",
    status: "all",
    priceMin,
    priceMax,
    yearMin: "",
    yearMax: "",
    mileageMax: "",
  };
}

const FIELD_CLASS =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

export function CarFilterBar({
  filters,
  onChange,
  brands,
  priceBounds,
}: {
  filters: CarFilters;
  onChange: (next: CarFilters) => void;
  brands: string[];
  priceBounds: { min: number; max: number };
}) {
  function set<K extends keyof CarFilters>(key: K, value: CarFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-4">
        {/* 關鍵字搜尋 */}
        <div className="min-w-[220px] flex-1">
          <label className="text-xs font-medium text-neutral-500">
            關鍵字搜尋（車牌／車型／VIN）
          </label>
          <input
            type="text"
            value={filters.keyword}
            onChange={(e) => set("keyword", e.target.value)}
            placeholder="例如：ABC-1234、Camry、WBA..."
            className={FIELD_CLASS}
          />
        </div>

        {/* 廠牌快速選單 */}
        <div>
          <label className="text-xs font-medium text-neutral-500">廠牌</label>
          <select
            value={filters.brand}
            onChange={(e) => set("brand", e.target.value)}
            className={FIELD_CLASS + " w-auto"}
          >
            <option value="all">全部廠牌</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* 狀態 Filter */}
        <div>
          <label className="text-xs font-medium text-neutral-500">狀態</label>
          <select
            value={filters.status}
            onChange={(e) => set("status", e.target.value as CarFilters["status"])}
            className={FIELD_CLASS + " w-auto"}
          >
            <option value="all">全部狀態</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {/* 年份區間 */}
        <div>
          <label className="text-xs font-medium text-neutral-500">出廠年份</label>
          <div className="mt-1 flex items-center gap-1.5">
            <input
              type="number"
              value={filters.yearMin}
              onChange={(e) => set("yearMin", e.target.value)}
              placeholder="起"
              className="w-16 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white"
            />
            <span className="text-neutral-300">–</span>
            <input
              type="number"
              value={filters.yearMax}
              onChange={(e) => set("yearMax", e.target.value)}
              placeholder="迄"
              className="w-16 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white"
            />
          </div>
        </div>

        {/* 里程上限 */}
        <div>
          <label className="text-xs font-medium text-neutral-500">里程上限 (km)</label>
          <input
            type="number"
            value={filters.mileageMax}
            onChange={(e) => set("mileageMax", e.target.value)}
            placeholder="不限"
            className="mt-1 w-28 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white"
          />
        </div>

        <button
          type="button"
          onClick={() => onChange(defaultCarFilters(priceBounds.min, priceBounds.max))}
          className="ml-auto text-xs text-neutral-400 underline-offset-2 hover:text-[#A6793D] hover:underline"
        >
          清除篩選
        </button>
      </div>

      {/* 價格區間 Slider（依開價 selling_price） */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-medium text-neutral-500">
          <span>開價區間</span>
          <span className="tabular-nums text-neutral-700">
            {formatCurrency(filters.priceMin)} – {formatCurrency(filters.priceMax)}
          </span>
        </div>
        <DualRangeSlider
          min={priceBounds.min}
          max={priceBounds.max}
          valueMin={filters.priceMin}
          valueMax={filters.priceMax}
          onChange={(priceMin, priceMax) => onChange({ ...filters, priceMin, priceMax })}
        />
      </div>
    </div>
  );
}

const THUMB_CLASS =
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#BFA074] [&::-webkit-slider-thumb]:shadow " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#BFA074]";

function DualRangeSlider({
  min,
  max,
  valueMin,
  valueMax,
  onChange,
}: {
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
}) {
  const range = Math.max(max - min, 1);
  const leftPct = ((valueMin - min) / range) * 100;
  const rightPct = ((valueMax - min) / range) * 100;

  return (
    <div className="relative mt-2 h-5">
      {/* 底層軌道 */}
      <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-neutral-200" />
      {/* 已選範圍高亮 */}
      <div
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#BFA074]/70"
        style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={valueMin}
        onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax), valueMax)}
        className={`pointer-events-none absolute top-0 h-5 w-full appearance-none bg-transparent ${THUMB_CLASS}`}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={valueMax}
        onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin))}
        className={`pointer-events-none absolute top-0 h-5 w-full appearance-none bg-transparent ${THUMB_CLASS}`}
      />
    </div>
  );
}
