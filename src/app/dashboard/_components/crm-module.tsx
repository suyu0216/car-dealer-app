"use client";

import { useEffect, useState } from "react";
import type { Customer } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";
import { CustomerFormModal, FOLLOW_UP_LABEL, FOLLOW_UP_STYLE } from "./customer-form-modal";

type ModalState = { mode: "create" } | { mode: "edit"; customer: Customer } | null;

export function CrmModule({
  customers,
  staff,
  isTenantAdmin,
}: {
  customers: Customer[];
  staff: { id: string; name: string | null }[];
  /** 客戶資料隱私保護：這裡拿到的 customers 陣列已經由資料庫 RLS
   * （customers_owner_or_tenant_admin）依身分自動篩選過——一般員工這裡
   * 收到的本來就只有自己名下的客戶，不用再另外過濾一次；只有老闆
   * （tenant_admin）看得到全體員工的客戶資料，額外多顯示「負責業務」
   * 欄位方便老闆分辨每筆名單是誰開發的。 */
  isTenantAdmin: boolean;
}) {
  const [modalState, setModalState] = useState<ModalState>(null);
  const staffNameById = new Map(staff.map((s) => [s.id, s.name ?? "未命名"]));

  // 2026-09-06 新增：證件照片上傳失敗時的非阻斷性警告，跟
  // cars-manager.tsx 的 Toast 是同一套模式。
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  function closeFormModal(warning?: string) {
    setModalState(null);
    if (warning) setToast(warning);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-800">CRM 客戶與賞車追蹤</h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            共 {customers.length} 位客戶名單
            {isTenantAdmin
              ? "（老闆檢視：全體員工的客戶資料）"
              : "（客戶資料是個人開發名單，只會顯示你自己建立的客戶）"}
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
              {isTenantAdmin && <th className="px-4 py-2 font-medium">負責業務</th>}
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {customers.length === 0 && (
              <tr>
                <td colSpan={isTenantAdmin ? 7 : 6} className="px-4 py-8 text-center text-neutral-400">
                  尚無客戶名單
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2">
                  <p className="flex items-center gap-1.5 font-medium text-neutral-800">
                    {c.name}
                    {/* 2026-09-06 新增：客戶類型標籤——「個人」是絕大多數
                        情況，不特別標示以免畫面雜亂，只標「公司」「車商」
                        這兩種比較少見、需要特別留意的類型。 */}
                    {c.customer_type !== "個人" && (
                      <span className="inline-flex items-center rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 ring-1 ring-inset ring-neutral-200">
                        {c.customer_type}
                      </span>
                    )}
                  </p>
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
                {isTenantAdmin && (
                  <td className="px-4 py-2 text-neutral-500">
                    {c.owner_profile_id ? staffNameById.get(c.owner_profile_id) ?? "未知員工" : "（舊資料，尚未歸屬）"}
                  </td>
                )}
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
          onClose={closeFormModal}
        />
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className="flex max-w-lg items-start gap-3 rounded-2xl border border-[#F0DFC0] bg-[#FBF1E4] px-4 py-3 text-sm text-[#8A5F24] shadow-lg">
            <span className="mt-0.5">⚠️</span>
            <p className="flex-1">{toast}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="關閉提示"
              className="text-[#B4813E] hover:text-[#8A5F24]"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
