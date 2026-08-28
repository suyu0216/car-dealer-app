"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import type { CompanyExpense } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";
import {
  createCompanyExpense,
  deleteCompanyExpense,
  type CompanyExpenseFormState,
} from "../company-expenses-actions";
import { COMPANY_EXPENSE_CATEGORIES, COMPANY_EXPENSE_PAYMENT_METHODS } from "@/lib/company-expense-constants";

const initialState: CompanyExpenseFormState = {};
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function CompanyExpensesModule({ expenses }: { expenses: CompanyExpense[] }) {
  const [state, formAction, pending] = useActionState(createCompanyExpense, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  // 從通知鈴鐺點「傳送門」進來的話，網址會帶 ?highlight=<company_expense_id>，
  // 進頁面後自動捲到、反白那一筆，不用自己在明細表裡找。
  const highlightId = useSearchParams().get("highlight");

  // 新增成功後把表單清空，讓使用者可以緊接著記下一筆——原本的 <form> 用的
  // 都是 uncontrolled input（defaultValue），存檔成功不會自動清空。
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state]);

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`expense-${highlightId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const totalExpenses = expenses.reduce((sum, item) => sum + Number(item.amount), 0);

  function handleDelete(id: string) {
    if (!confirm("確定要刪除這筆公司開銷紀錄嗎？")) return;
    setDeletingId(id);
    startDeleteTransition(async () => {
      await deleteCompanyExpense(id);
      setDeletingId(null);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* 左側：新增開銷表單 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-neutral-800 border-b border-neutral-100 pb-3 mb-4">
          ➕ 記一筆公司開銷
        </h2>
        <form ref={formRef} action={formAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700">支出日期</label>
            <input
              name="expense_date"
              type="date"
              defaultValue={todayIso()}
              required
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">費用類別</label>
            <select name="category" defaultValue={COMPANY_EXPENSE_CATEGORIES[0].value} className={INPUT_CLASS}>
              {COMPANY_EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">項目名稱</label>
            <input
              name="title"
              placeholder="例如：7 月份展示場電費"
              required
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">金額 (NT$)</label>
            <input name="amount" type="number" min={0} step="any" placeholder="0" required className={INPUT_CLASS} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-neutral-700">付款方式</label>
              <select name="payment_method" defaultValue={COMPANY_EXPENSE_PAYMENT_METHODS[0]} className={INPUT_CLASS}>
                {COMPANY_EXPENSE_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">經手/請款人</label>
              <input name="payer_name" placeholder="經手人" className={INPUT_CLASS} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">發票/收據號碼（選填）</label>
            <input name="invoice_number" placeholder="例如：AB12345678" className={INPUT_CLASS} />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">備註（選填）</label>
            <textarea name="note" rows={2} placeholder="補充說明…" className={INPUT_CLASS + " resize-y"} />
          </div>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-[#BFA074] py-2.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "儲存中…" : "新增開銷紀錄"}
          </button>
        </form>
      </div>

      {/* 右側：開銷列表歷史 */}
      <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
          <h2 className="text-base font-semibold text-neutral-800">📋 公司營運開銷明細</h2>
          <span className="text-xs font-medium text-neutral-500">
            累計總支出：
            <strong className="ml-1 text-sm text-[#B75454]">{formatCurrency(totalExpenses)}</strong>
          </span>
        </div>

        {expenses.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">目前尚無公司開銷紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50 text-xs font-semibold text-neutral-500">
                  <th className="p-3">日期</th>
                  <th className="p-3">類別</th>
                  <th className="p-3">項目名稱</th>
                  <th className="p-3">方式</th>
                  <th className="p-3 text-right">金額</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {expenses.map((item) => (
                  <tr
                    key={item.id}
                    id={`expense-${item.id}`}
                    className={
                      "transition hover:bg-neutral-50 " +
                      (item.id === highlightId ? "bg-[#FBF1E4] ring-2 ring-inset ring-[#BFA074]" : "")
                    }
                  >
                    <td className="whitespace-nowrap p-3 text-xs text-neutral-600">{item.expense_date}</td>
                    <td className="whitespace-nowrap p-3">
                      <span className="rounded bg-[#FBF1E4] px-2 py-1 text-xs font-medium text-[#A6793D]">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-neutral-800">
                      {item.title}
                      {item.note && <span className="block text-xs font-normal text-neutral-400">{item.note}</span>}
                    </td>
                    <td className="whitespace-nowrap p-3 text-xs text-neutral-500">{item.payment_method ?? "—"}</td>
                    <td className="whitespace-nowrap p-3 text-right font-semibold text-[#B75454]">
                      -{formatCurrency(item.amount)}
                    </td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <button
                        type="button"
                        disabled={isDeleting && deletingId === item.id}
                        onClick={() => handleDelete(item.id)}
                        className="text-xs text-neutral-400 underline-offset-2 hover:text-red-500 hover:underline disabled:opacity-50"
                      >
                        {isDeleting && deletingId === item.id ? "刪除中…" : "刪除"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
