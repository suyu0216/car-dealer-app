"use client";

import { useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Car, RepairItem, RepairItemCategory, RepairItemStatus } from "@/lib/supabase/types";
import { formatCurrency, taiwanDateParts } from "@/lib/format";
import { createRepairItem, type RepairItemFormState } from "../repair-items-actions";
import { REPAIR_ITEM_CATEGORIES } from "@/lib/repair-item-constants";
import { HandlerNameSelect, REPAIR_CATEGORY_ICON, REPAIR_STATUS_LABEL, RepairItemRow } from "./car-maintenance-tab";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

const STATUS_FILTER_OPTIONS: RepairItemStatus[] = ["pending", "approved", "rejected"];

type DateFilter = "today" | "month" | "all";

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "today", label: "今天" },
  { value: "month", label: "本月" },
  { value: "all", label: "全部" },
];

// 「今天/本月」一律用台灣時間判斷，不是程式碼實際執行環境（伺服器/瀏覽器）
// 的系統時區——見 src/lib/format.ts 的 taiwanDateParts() 說明。
function isSameDay(iso: string, now: Date) {
  const a = taiwanDateParts(iso);
  const b = taiwanDateParts(now);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function isSameMonth(iso: string, now: Date) {
  const a = taiwanDateParts(iso);
  const b = taiwanDateParts(now);
  return a.year === b.year && a.month === b.month;
}

export function MaintenanceModule({
  repairItems,
  cars,
  canReview,
  receiptUrls,
  staff,
}: {
  repairItems: RepairItem[];
  cars: Car[];
  /** 是否能核准/退回請款——2026-08-29 起改用 canApproveRepairs 權限開關
   * 判斷（老闆恆為 true，會計預設也是 true，見 permissions.ts），不再只
   * 認「是不是老闆」。 */
  canReview: boolean;
  receiptUrls: Record<string, string>;
  /** 「墊款業務/經手人」下拉選單用——同車行的員工清單，新邀請的員工會
   * 自動出現在這裡。 */
  staff: { id: string; name: string | null }[];
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | RepairItemStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | RepairItemCategory>("all");
  // 預設只看「今天」送出的請款，比較貼近會計每天結案的工作習慣；但這個
  // 篩選只影響「今天/本月/全部」這條軸，不影響狀態篩選——只要另外點
  // 「待審核」，不管日期篩選選什麼都會照樣看到全部還沒處理完的舊案子
  // （見下面 filtered 的邏輯），不會因為預設篩今天就把舊的待辦漏掉。
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [showForm, setShowForm] = useState(false);
  const now = new Date();

  // 從通知鈴鐺點「傳送門」進來的話，網址會帶 ?highlight=<repair_item_id>，
  // 目的是直接跳到、反白那一筆——所以下面 filtered 特別放行這一筆，不管
  // 目前篩選條件是什麼都一定會顯示，不然萬一那筆不是「今天」送出的、或
  // 剛好被篩掉，點通知進來反而找不到，違背「傳送門」的初衷。
  const highlightId = useSearchParams().get("highlight");

  const carById = new Map(cars.map((c) => [c.id, c]));

  const filtered = repairItems.filter((r) => {
    if (highlightId && r.id === highlightId) return true;
    const statusMatch = statusFilter === "all" || r.status === statusFilter;
    if (!statusMatch) return false;
    if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
    // 待審核的案子不受日期篩選影響——不管選今天/本月/全部，只要還沒審核
    // 完就一定要看得到，避免忘記處理積壓的舊案子。
    if (statusFilter === "pending") return true;
    if (dateFilter === "today") return isSameDay(r.created_at, now);
    if (dateFilter === "month") return isSameMonth(r.created_at, now);
    return true;
  });

  // 進頁面後自動捲到那一筆，讓「傳送門」名副其實——不用自己在列表裡找。
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`repair-item-${highlightId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  // 待審核筆數一律看「全部」，不受日期篩選影響——這是提醒用的積壓指標，
  // 篩到「今天」也不該讓這個數字看起來變少、誤以為沒有積壓案子。
  const pendingCount = repairItems.filter((r) => r.status === "pending").length;
  const approvedTotal = repairItems
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  // 本月統計：不受篩選影響，一律顯示，讓會計不用切篩選就能隨時看到
  // 「這個月請款到底多少了」。
  const monthItems = repairItems.filter((r) => isSameMonth(r.created_at, now));
  const monthTotal = monthItems.reduce((sum, r) => sum + Number(r.amount), 0);
  const monthApprovedTotal = monthItems
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-800">整備維修與會計請款</h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            {pendingCount} 筆待審核（全部）・累計已撥款 {formatCurrency(approvedTotal)}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            本月請款 {monthItems.length} 筆・共 {formatCurrency(monthTotal)}
            ・本月已撥款 {formatCurrency(monthApprovedTotal)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066]"
        >
          + 新增維修請款
        </button>
      </div>

      {/* 日期篩選：預設「今天」 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {DATE_FILTER_OPTIONS.map((opt) => (
          <FilterChip key={opt.value} active={dateFilter === opt.value} onClick={() => setDateFilter(opt.value)}>
            {opt.label}
          </FilterChip>
        ))}
      </div>

      {/* 狀態篩選 */}
      <div className="mt-2 flex flex-wrap gap-2">
        <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          全部
        </FilterChip>
        {STATUS_FILTER_OPTIONS.map((s) => (
          <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {REPAIR_STATUS_LABEL[s]}
          </FilterChip>
        ))}
      </div>

      {/* 類別篩選 */}
      <div className="mt-2 flex flex-wrap gap-2">
        <FilterChip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>
          全部類別
        </FilterChip>
        {REPAIR_ITEM_CATEGORIES.map((c) => (
          <FilterChip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}>
            {REPAIR_CATEGORY_ICON[c]} {c}
          </FilterChip>
        ))}
      </div>
      {statusFilter === "pending" && dateFilter !== "all" && (
        <p className="mt-2 text-xs text-neutral-400">
          目前顯示「待審核」會忽略日期篩選，列出全部還沒處理完的案子。
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {filtered.length === 0 && (
          <li className="rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
            沒有符合條件的請款紀錄
            {dateFilter === "today" && statusFilter !== "pending" && (
              <>
                <br />
                想看更早之前的紀錄，可以點上面的「本月」或「全部」。
              </>
            )}
          </li>
        )}
        {filtered.map((item) => {
          const car = carById.get(item.car_id);
          return (
            <RepairItemRow
              key={item.id}
              item={item}
              canReview={canReview}
              receiptUrl={item.evidence_path ? receiptUrls[item.evidence_path] : (item.evidence_url ?? undefined)}
              carLabel={car ? `${car.brand ? `${car.brand} ` : ""}${car.model_name}` : "（車輛已刪除）"}
              highlighted={item.id === highlightId}
            />
          );
        })}
      </ul>

      {showForm && <MaintenanceRequestModal cars={cars} staff={staff} onClose={() => setShowForm(false)} />}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition " +
        (active
          ? "bg-[#BFA074] text-white ring-[#BFA074]"
          : "bg-white text-neutral-500 ring-neutral-200 hover:text-neutral-800")
      }
    >
      {children}
    </button>
  );
}

const requestInitialState: RepairItemFormState = {};
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

function MaintenanceRequestModal({
  cars,
  staff,
  onClose,
}: {
  cars: Car[];
  staff: { id: string; name: string | null }[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(createRepairItem, requestInitialState);
  const { markDirty, requestClose } = useUnsavedChangesGuard(onClose);

  useEffect(() => {
    if (state?.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    // 背景不綁 onClick，避免點外面誤觸清掉表單。
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4 py-8">
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-800">新增維修請款</h3>
          <button type="button" onClick={requestClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>

        <form action={formAction} onChange={markDirty} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700">車輛</label>
            <select name="car_id" required defaultValue="" className={INPUT_CLASS}>
              <option value="" disabled>
                請選擇車輛
              </option>
              {cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.brand ? `${c.brand} ` : ""}
                  {c.model_name}
                  {c.license_plate ? `（${c.license_plate}）` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700">維修項目名稱</label>
              <input name="item_name" required placeholder="例如：烤漆、換機油" className={INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">金額</label>
              <input name="amount" type="number" min={0} step="any" required className={INPUT_CLASS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="maintenance-category" className="block text-sm font-medium text-neutral-700">
                類別
              </label>
              <select id="maintenance-category" name="category" defaultValue="維修" className={INPUT_CLASS}>
                {REPAIR_ITEM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {REPAIR_CATEGORY_ICON[c]} {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">廠商/保養廠名稱</label>
              <input name="vendor_name" placeholder="例如：三久烤漆廠" className={INPUT_CLASS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <HandlerNameSelect staff={staff} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700">單據號碼/發票號</label>
              <input name="receipt_number" className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor="maintenance-receipt" className="block text-sm font-medium text-neutral-700">
                維修單據/發票
              </label>
              <input
                id="maintenance-receipt"
                type="file"
                name="receipt"
                accept="image/*,application/pdf"
                className="mt-1 block w-full text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-[#BFA074] file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-[#AD9066]"
              />
            </div>
          </div>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:opacity-60"
            >
              {pending ? "送出中…" : "送出請款"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
