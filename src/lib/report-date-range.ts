// 「報表分析」幾個報表共用的日期區間篩選邏輯——跟
// financial-accounts-module.tsx 裡收支明細用的是同一個概念（本月／
// 上月／自訂／全部），這裡抽成獨立的小工具，給多個報表元件共用，不用
// 各自重寫一份一樣的月份起訖日計算。
import { taiwanDateParts } from "./format";

export type DateRangePreset = "all" | "thisMonth" | "lastMonth" | "custom";

/** 算出某個月份（0＝本月，-1＝上月……）完整的起訖日期（YYYY-MM-DD）。
 * 用 taiwanDateParts 先拿到「現在」在台灣時區的年/月，避免容器所在
 * 時區跨日造成算錯月份。 */
export function monthRange(offsetMonths: number): { start: string; end: string } {
  const { year, month } = taiwanDateParts(new Date());
  const m0 = month - 1 + offsetMonths; // 0-indexed，可能是負數或超過 11，Date 會自動進位/借位
  const firstOfMonth = new Date(Date.UTC(year, m0, 1));
  const firstOfNextMonth = new Date(Date.UTC(year, m0 + 1, 1));
  const lastOfMonth = new Date(firstOfNextMonth.getTime() - 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${firstOfMonth.getUTCFullYear()}-${pad(firstOfMonth.getUTCMonth() + 1)}-01`;
  const end = `${lastOfMonth.getUTCFullYear()}-${pad(lastOfMonth.getUTCMonth() + 1)}-${pad(lastOfMonth.getUTCDate())}`;
  return { start, end };
}

/** 把 preset（＋自訂輸入框的值）換算成實際要用的 {start, end}（任一邊
 * null 代表那一邊不設界線）。 */
export function resolveRange(
  preset: DateRangePreset,
  customStart: string,
  customEnd: string
): { start: string | null; end: string | null } {
  if (preset === "all") return { start: null, end: null };
  if (preset === "thisMonth") return monthRange(0);
  if (preset === "lastMonth") return monthRange(-1);
  return { start: customStart || null, end: customEnd || null };
}

/** 判斷一個 YYYY-MM-DD（或帶時間的 ISO 字串）日期是否落在區間內
 * （含頭尾）。 */
export function isInRange(dateStr: string, range: { start: string | null; end: string | null }): boolean {
  const d = dateStr.slice(0, 10);
  if (range.start && d < range.start) return false;
  if (range.end && d > range.end) return false;
  return true;
}
