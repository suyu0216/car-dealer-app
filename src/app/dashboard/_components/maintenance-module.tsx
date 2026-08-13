"use client";

import { useActionState, useEffect, useState } from "react";
import type { Car, RepairItem, RepairItemStatus, Role } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";
import { createRepairItem, type RepairItemFormState } from "../repair-items-actions";
import { REPAIR_STATUS_LABEL, RepairItemRow } from "./car-maintenance-tab";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

const STATUS_FILTER_OPTIONS: RepairItemStatus[] = ["pending", "approved", "rejected"];

export function MaintenanceModule({
  repairItems,
  cars,
  role,
  receiptUrls,
}: {
  repairItems: RepairItem[];
  cars: Car[];
  role: Role;
  receiptUrls: Record<string, string>;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | RepairItemStatus>("all");
  const [showForm, setShowForm] = useState(false);
  const canReview = role === "tenant_admin";

  const carById = new Map(cars.map((c) => [c.id, c]));
  const filtered = repairItems.filter(
    (r) => statusFilter === "all" || r.status === statusFilter
  );

  const pendingCount = repairItems.filter((r) => r.status === "pending").length;
  const approvedTotal = repairItems
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-800">整備維修與會計請款</h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            {pendingCount} 筆待審核・累計已撥款 {formatCurrency(approvedTotal)}
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

      {/* 狀態篩選 */}
      <div className="mt-4 flex flex-wrap gap-2">
        <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          全部
        </FilterChip>
        {STATUS_FILTER_OPTIONS.map((s) => (
          <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {REPAIR_STATUS_LABEL[s]}
          </FilterChip>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {filtered.length === 0 && (
          <li className="rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
            沒有符合條件的請款紀錄
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
            />
          );
        })}
      </ul>

      {showForm && <MaintenanceRequestModal cars={cars} onClose={() => setShowForm(false)} />}
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

function MaintenanceRequestModal({ cars, onClose }: { cars: Car[]; onClose: () => void }) {
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
              <label className="block text-sm font-medium text-neutral-700">廠商/保養廠名稱</label>
              <input name="vendor_name" placeholder="例如：三久烤漆廠" className={INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">墊款業務/經手人</label>
              <input name="handler_name" placeholder="姓名" className={INPUT_CLASS} />
            </div>
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
