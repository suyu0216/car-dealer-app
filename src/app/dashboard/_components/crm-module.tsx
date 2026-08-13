"use client";

import { useState } from "react";
import type { Customer } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";
import { CustomerFormModal, FOLLOW_UP_LABEL, FOLLOW_UP_STYLE } from "./customer-form-modal";

type ModalState = { mode: "create" } | { mode: "edit"; customer: Customer } | null;

export function CrmModule({ customers }: { customers: Customer[] }) {
  const [modalState, setModalState] = useState<ModalState>(null);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-800">CRM 客戶與賞車追蹤</h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            共 {customers.length} 位客戶名單
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalState({ mode: "create" })}
          className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066]"
        >
          + 新增客戶
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">客戶</th>
              <th className="px-4 py-2 font-medium">感興趣車款</th>
              <th className="px-4 py-2 font-medium">預算區間</th>
              <th className="px-4 py-2 font-medium">跟進狀態</th>
              <th className="px-4 py-2 font-medium">LINE</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  尚無客戶名單
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2">
                  <p className="font-medium text-neutral-800">{c.name}</p>
                  <p className="text-xs text-neutral-400">{c.phone ?? "—"}</p>
                </td>
                <td className="px-4 py-2 text-neutral-600">{c.interested_model ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-600">
                  {c.budget_min != null || c.budget_max != null
                    ? `${c.budget_min != null ? formatCurrency(c.budget_min) : "不限"} ~ ${
                        c.budget_max != null ? formatCurrency(c.budget_max) : "不限"
                      }`
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset " +
                      FOLLOW_UP_STYLE[c.follow_up_status]
                    }
                  >
                    {FOLLOW_UP_LABEL[c.follow_up_status]}
                  </span>
                </td>
                <td className="px-4 py-2 text-neutral-500">{c.line_id ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setModalState({ mode: "edit", customer: c })}
                    className="text-neutral-400 underline-offset-2 hover:text-[#A6793D] hover:underline"
                  >
                    編輯
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalState && (
        <CustomerFormModal
          mode={modalState.mode}
          customer={modalState.mode === "edit" ? modalState.customer : undefined}
          onClose={() => setModalState(null)}
        />
      )}
    </section>
  );
}
