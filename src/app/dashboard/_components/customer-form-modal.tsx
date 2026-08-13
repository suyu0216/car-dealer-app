"use client";

import { useActionState, useEffect } from "react";
import { createCustomer, updateCustomer, type CustomerFormState } from "../customers-actions";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";
import type { Customer, CustomerFollowUpStatus } from "@/lib/supabase/types";

export const FOLLOW_UP_LABEL: Record<CustomerFollowUpStatus, string> = {
  new: "新名單",
  test_drive_followup: "試駕後回訪",
  deposit_received: "訂金已收",
  delivery_care: "交車關懷",
};

export const FOLLOW_UP_STYLE: Record<CustomerFollowUpStatus, string> = {
  new: "bg-neutral-100 text-neutral-500 ring-neutral-200",
  test_drive_followup: "bg-[#EEF1F4] text-[#5B6B7A] ring-[#DCE3E9]",
  deposit_received: "bg-[#FBF1E4] text-[#B4813E] ring-[#F0DFC0]",
  delivery_care: "bg-[#EEF2ED] text-[#5F7563] ring-[#D9E2D6]",
};

const FOLLOW_UP_OPTIONS: CustomerFollowUpStatus[] = [
  "new",
  "test_drive_followup",
  "deposit_received",
  "delivery_care",
];

const initialState: CustomerFormState = {};
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

export function CustomerFormModal({
  mode,
  customer,
  onClose,
}: {
  mode: "create" | "edit";
  customer?: Customer;
  onClose: () => void;
}) {
  const action = mode === "create" ? createCustomer : updateCustomer;
  const [state, formAction, pending] = useActionState(action, initialState);
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
          <h3 className="text-base font-semibold text-neutral-800">
            {mode === "create" ? "新增客戶" : "編輯客戶"}
          </h3>
          <button type="button" onClick={requestClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>

        <form action={formAction} onChange={markDirty} className="mt-4 space-y-4">
          {mode === "edit" && customer && <input type="hidden" name="id" value={customer.id} />}

          <div className="grid grid-cols-2 gap-3">
            <Field label="客戶姓名" name="name" defaultValue={customer?.name ?? ""} required />
            <Field label="電話" name="phone" defaultValue={customer?.phone ?? ""} />
          </div>

          <Field
            label="感興趣車款"
            name="interested_model"
            defaultValue={customer?.interested_model ?? ""}
            placeholder="例如：Toyota Camry"
          />

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="預算下限"
              name="budget_min"
              type="number"
              defaultValue={customer?.budget_min != null ? String(customer.budget_min) : ""}
            />
            <Field
              label="預算上限"
              name="budget_max"
              type="number"
              defaultValue={customer?.budget_max != null ? String(customer.budget_max) : ""}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">跟進狀態</label>
            <select
              name="follow_up_status"
              defaultValue={customer?.follow_up_status ?? "new"}
              className={INPUT_CLASS}
            >
              {FOLLOW_UP_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {FOLLOW_UP_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <Field
            label="LINE ID（預留欄位）"
            name="line_id"
            defaultValue={customer?.line_id ?? ""}
            placeholder="尚未綁定官方帳號，先手動記錄"
          />

          <div>
            <label className="block text-sm font-medium text-neutral-700">備註</label>
            <textarea
              name="note"
              defaultValue={customer?.note ?? ""}
              rows={2}
              className={INPUT_CLASS + " resize-y"}
            />
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
