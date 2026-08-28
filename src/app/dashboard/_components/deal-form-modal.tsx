"use client";

import { useActionState, useEffect, useState } from "react";
import { createDeal, updateDeal, type DealFormState } from "../deals-actions";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";
import { CASH_POOL_METHOD_OPTIONS } from "@/lib/cash-pool";
import type { Car, Customer, Deal, DealStatus } from "@/lib/supabase/types";

const STATUS_OPTIONS: { value: DealStatus; label: string }[] = [
  { value: "draft", label: "草約" },
  { value: "signed", label: "已簽約" },
  { value: "delivered", label: "已交車" },
];

const initialState: DealFormState = {};
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

export function DealFormModal({
  mode,
  deal,
  cars,
  customers,
  staff,
  canSetCommission,
  onClose,
}: {
  mode: "create" | "edit";
  deal?: Deal;
  cars: Car[];
  customers: Customer[];
  staff: { id: string; name: string | null }[];
  /** 只有車行管理員能填寫/修改業務抽成，避免一般業務球員兼裁判自己填。 */
  canSetCommission: boolean;
  onClose: () => void;
}) {
  const action = mode === "create" ? createDeal : updateDeal;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [customerId, setCustomerId] = useState(deal?.customer_id ?? "");
  const [customerName, setCustomerName] = useState(deal?.customer_name ?? "");
  const [customerPhone, setCustomerPhone] = useState(deal?.customer_phone ?? "");
  const { markDirty, requestClose } = useUnsavedChangesGuard(onClose);

  useEffect(() => {
    if (state?.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleSelectCustomer(id: string) {
    setCustomerId(id);
    const found = customers.find((c) => c.id === id);
    if (found) {
      setCustomerName(found.name);
      setCustomerPhone(found.phone ?? "");
    }
  }

  return (
    // 背景不綁 onClick，避免點外面誤觸清掉表單。
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4 py-8">
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-800">
            {mode === "create" ? "新增合約" : "編輯合約"}
          </h3>
          <button type="button" onClick={requestClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>

        <form action={formAction} onChange={markDirty} className="mt-4 space-y-4">
          {mode === "edit" && deal && <input type="hidden" name="id" value={deal.id} />}
          <input type="hidden" name="customer_id" value={customerId} />

          <div>
            <label className="block text-sm font-medium text-neutral-700">選定車輛</label>
            <select name="car_id" defaultValue={deal?.car_id ?? ""} required className={INPUT_CLASS}>
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

          <div>
            <label className="block text-sm font-medium text-neutral-700">選定客戶（可選）</label>
            <select
              value={customerId}
              onChange={(e) => handleSelectCustomer(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">不指定 CRM 客戶，直接手動輸入</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? `（${c.phone}）` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700">客戶姓名</label>
              <input
                name="customer_name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">客戶電話</label>
              <input
                name="customer_phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field
              label="成交價"
              name="final_price"
              type="number"
              defaultValue={deal?.final_price != null ? String(deal.final_price) : ""}
              required
            />
            <Field
              label="訂金"
              name="deposit_amount"
              type="number"
              defaultValue={deal?.deposit_amount != null ? String(deal.deposit_amount) : ""}
            />
            <Field
              label="尾款"
              name="balance_amount"
              type="number"
              defaultValue={deal?.balance_amount != null ? String(deal.balance_amount) : ""}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">收款方式（訂金＋尾款）</label>
            <select name="payment_method" defaultValue={deal?.payment_method ?? ""} className={INPUT_CLASS}>
              <option value="">尚未收款／不指定</option>
              {CASH_POOL_METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-400">
              給後台「資金總覽」水池分類用——客人這筆錢是付現金還是匯款進來。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="貸款進度"
              name="loan_status"
              defaultValue={deal?.loan_status ?? ""}
              placeholder="無貸款／審核中／已核貸"
            />
            <div>
              <label className="block text-sm font-medium text-neutral-700">承辦業務</label>
              <select
                name="salesperson_id"
                defaultValue={deal?.salesperson_id ?? ""}
                className={INPUT_CLASS}
              >
                <option value="">未指定</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ?? "未命名"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 業務抽成只有管理員能填——一般業務不開放自己填自己的抽成金額。
              非管理員送出表單時這個欄位完全不會出現在 FormData 裡，
              deals-actions.ts 那邊也會忽略任何非管理員帶上來的值，雙重防呆。 */}
          {canSetCommission && (
            <Field
              label="預估抽成（撥給承辦業務）"
              name="commission_amount"
              type="number"
              defaultValue={deal?.commission_amount != null ? String(deal.commission_amount) : ""}
              placeholder="選填，例如 8000"
            />
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700">合約狀態</label>
            <select name="status" defaultValue={deal?.status ?? "draft"} className={INPUT_CLASS}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">備註</label>
            <textarea name="note" defaultValue={deal?.note ?? ""} rows={2} className={INPUT_CLASS + " resize-y"} />
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
              {pending ? "儲存中…" : "儲存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-neutral-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        className={INPUT_CLASS}
      />
    </div>
  );
}
