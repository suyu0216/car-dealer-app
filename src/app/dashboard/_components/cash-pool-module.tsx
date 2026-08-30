"use client";

// 「資金總覽」——現金水池／銀行水池，讓管理員一眼看出手上現金、銀行帳戶
// 各有多少錢。畫面本身不碰資料庫，純粹拿 accounting/page.tsx 已經查好的
// deals/cars/expenses/手動記帳資料，丟給 computeCashPoolSummary()（見
// src/lib/cash-pool.ts）算出兩池的餘額跟合併時間軸。
import { useActionState, useEffect, useState } from "react";
import {
  createManualCashTransaction,
  deleteManualCashTransaction,
  saveCashPoolOpening,
  type CashPoolFormState,
} from "../cash-pool-actions";
import { CASH_POOL_METHOD_OPTIONS, MANUAL_TRANSACTION_CATEGORIES, computeCashPoolSummary } from "@/lib/cash-pool";
import { formatCurrency, formatDate, currentTaiwanDateKey } from "@/lib/format";
import type { Car, CompanyExpense, Deal, Tenant, Transaction, TransactionType } from "@/lib/supabase/types";

type TenantPoolFields = Pick<Tenant, "cash_opening_balance" | "bank_opening_balance" | "cash_pool_started_at">;
type DealSlice = Pick<
  Deal,
  "id" | "final_price" | "deposit_amount" | "balance_amount" | "payment_method" | "status" | "created_at" | "customer_name"
>;
type CarSlice = Pick<Car, "id" | "paid_amount" | "payment_method" | "created_at" | "brand" | "model_name">;

const emptyState: CashPoolFormState = {};
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

export function CashPoolModule({
  tenant,
  isTenantAdmin,
  canViewCost,
  deals,
  cars,
  expenses,
  manualTransactions,
  onDataChanged,
}: {
  tenant: TenantPoolFields | null;
  isTenantAdmin: boolean;
  canViewCost: boolean;
  deals: DealSlice[];
  cars: CarSlice[];
  expenses: Pick<CompanyExpense, "id" | "amount" | "payment_method" | "expense_date" | "title">[];
  manualTransactions: Pick<Transaction, "id" | "type" | "amount" | "payment_method" | "date" | "category" | "note">[];
  onDataChanged: () => void;
}) {
  const [showSetup, setShowSetup] = useState(false);

  if (!canViewCost) {
    return (
      <section className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-12 text-center text-sm text-neutral-400">
        🔒 此功能尚未開放，請洽車行管理員開啟「檢視成本與底價」權限。
      </section>
    );
  }

  const configured = !!tenant?.cash_pool_started_at;

  if (!configured || showSetup) {
    return (
      <CashPoolSetupCard
        tenant={tenant}
        isTenantAdmin={isTenantAdmin}
        onSaved={() => {
          setShowSetup(false);
          onDataChanged();
        }}
        onCancel={configured ? () => setShowSetup(false) : undefined}
      />
    );
  }

  const summary = computeCashPoolSummary({
    cashOpening: tenant?.cash_opening_balance ?? null,
    bankOpening: tenant?.bank_opening_balance ?? null,
    startedAt: tenant?.cash_pool_started_at ?? null,
    deals,
    cars,
    expenses,
    manual: manualTransactions,
  });

  const scaleMax = Math.max(summary.cash.balance, summary.bank.balance, 1) * 1.15;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-800">💰 資金總覽</h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            自 {formatDate(summary.startedAt)} 起算，累計成交收款／進貨付款／公司開銷／手動紀錄
          </p>
        </div>
        {isTenantAdmin && (
          <button
            type="button"
            onClick={() => setShowSetup(true)}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:border-[#BFA074] hover:text-[#A6793D]"
          >
            調整起算點
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PoolCard label="現金水池" icon="💵" totals={summary.cash} scaleMax={scaleMax} accent="cash" />
        <PoolCard label="銀行水池" icon="🏦" totals={summary.bank} scaleMax={scaleMax} accent="bank" />
      </div>

      <ManualEntryPanel onSaved={onDataChanged} />

      <CashPoolTimeline events={summary.timeline} onDeleted={onDataChanged} />
    </section>
  );
}

function PoolCard({
  label,
  icon,
  totals,
  scaleMax,
  accent,
}: {
  label: string;
  icon: string;
  totals: { opening: number; inflow: number; outflow: number; balance: number };
  scaleMax: number;
  accent: "cash" | "bank";
}) {
  const negative = totals.balance < 0;
  const pct = negative ? 5 : Math.max(6, Math.min(100, (totals.balance / scaleMax) * 100));
  const gradient =
    accent === "cash"
      ? "linear-gradient(180deg, #E4C589 0%, #BFA074 55%, #A6793D 100%)"
      : "linear-gradient(180deg, #7C93A8 0%, #4B5B6B 55%, #35414D 100%)";
  const waveColor = accent === "cash" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.25)";

  return (
    <div className="relative h-56 overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
      {/* 水池液面：高度依餘額占比撐開，頂端疊兩層半透明波浪营造水面感。 */}
      <div
        className="absolute inset-x-0 bottom-0 transition-all duration-700 ease-out"
        style={{ height: `${pct}%`, background: negative ? "#DC5B4E" : gradient }}
      >
        <svg
          className="absolute -top-3 left-0 h-4 w-[200%] animate-[pool-wave_7s_linear_infinite]"
          viewBox="0 0 400 20"
          preserveAspectRatio="none"
        >
          <path
            d="M0 10 Q50 20 100 10 T200 10 T300 10 T400 10 V20 H0 Z"
            fill={waveColor}
          />
        </svg>
        <svg
          className="absolute -top-2 left-0 h-4 w-[200%] animate-[pool-wave_11s_linear_infinite_reverse]"
          viewBox="0 0 400 20"
          preserveAspectRatio="none"
        >
          <path
            d="M0 12 Q50 4 100 12 T200 12 T300 12 T400 12 V20 H0 Z"
            fill="rgba(255,255,255,0.18)"
          />
        </svg>
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <span aria-hidden>{icon}</span>
          {label}
        </div>
        <div>
          <p className={"text-3xl font-bold " + (pct > 45 ? "text-white drop-shadow-sm" : "text-neutral-900")}>
            {formatCurrency(totals.balance)}
          </p>
          <p className={"mt-1 text-xs " + (pct > 45 ? "text-white/85" : "text-neutral-500")}>
            起算 {formatCurrency(totals.opening)} ・ 流入 +{formatCurrency(totals.inflow)} ・ 流出 −
            {formatCurrency(totals.outflow)}
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes pool-wave {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}

function CashPoolSetupCard({
  tenant,
  isTenantAdmin,
  onSaved,
  onCancel,
}: {
  tenant: TenantPoolFields | null;
  isTenantAdmin: boolean;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveCashPoolOpening, emptyState);

  useEffect(() => {
    if (state?.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!isTenantAdmin) {
    return (
      <section className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-12 text-center text-sm text-neutral-400">
        💰 資金總覽尚未設定起算點，請請車行管理員到「資金總覽」設定現在現金／銀行各有多少錢。
      </section>
    );
  }

  const today = currentTaiwanDateKey();

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-800">
        {tenant?.cash_pool_started_at ? "調整資金水池起算點" : "💰 設定資金水池起算點"}
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        系統沒有您過去的帳本，沒辦法無中生有算出「現在」的正確餘額——請先告訴系統「今天」現金櫃裡、銀行戶頭各有多少錢，
        從這天開始，之後每一筆成交收款、進貨付款、公司開銷、手動紀錄都會自動幫您加加減減。
        {tenant?.cash_pool_started_at && "（調整起算點會讓兩個水池的餘額整個重新計算，請確認金額正確再儲存。）"}
      </p>

      <form action={formAction} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700">起算日期</label>
          <input
            type="date"
            name="cash_pool_started_at"
            defaultValue={tenant?.cash_pool_started_at ?? today}
            required
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">現金餘額（NT$）</label>
          <input
            type="number"
            name="cash_opening_balance"
            min={0}
            step="any"
            placeholder="0"
            defaultValue={tenant?.cash_opening_balance != null ? String(tenant.cash_opening_balance) : ""}
            required
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">銀行餘額（NT$）</label>
          <input
            type="number"
            name="bank_opening_balance"
            min={0}
            step="any"
            placeholder="0"
            defaultValue={tenant?.bank_opening_balance != null ? String(tenant.bank_opening_balance) : ""}
            required
            className={INPUT_CLASS}
          />
        </div>

        {state?.error && (
          <p className="sm:col-span-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
            {state.error}
          </p>
        )}

        <div className="flex justify-end gap-2 sm:col-span-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              取消
            </button>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[#BFA074] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:opacity-60"
          >
            {pending ? "儲存中…" : "儲存起算點"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ManualEntryPanel({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createManualCashTransaction, emptyState);
  const today = currentTaiwanDateKey();

  useEffect(() => {
    if (state?.success) {
      setOpen(false);
      onSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-dashed border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-500 transition hover:border-[#BFA074] hover:text-[#A6793D]"
      >
        ➕ 記一筆其他現金異動（老闆存入/提領、銀行利息等）
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">記一筆其他現金異動</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-700">
          ✕
        </button>
      </div>
      <p className="mt-1 text-xs text-neutral-400">
        只用來記「不屬於成交收款／公司開銷／進貨付款」的現金變化，例如老闆自己存入/提領周轉金。
      </p>

      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-700">日期</label>
          <input type="date" name="date" defaultValue={today} required className={INPUT_CLASS} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">收入／支出</label>
          <select name="type" defaultValue={"income" satisfies TransactionType} className={INPUT_CLASS}>
            <option value="income">💰 流入水池（例如老闆存入）</option>
            <option value="expense">💸 流出水池（例如老闆提領）</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">類別</label>
          <select name="category" defaultValue={MANUAL_TRANSACTION_CATEGORIES[0]} className={INPUT_CLASS}>
            {MANUAL_TRANSACTION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">金額（NT$）</label>
          <input type="number" name="amount" min={0} step="any" placeholder="0" required className={INPUT_CLASS} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">歸類</label>
          <select name="payment_method" defaultValue="" required className={INPUT_CLASS}>
            <option value="" disabled>
              請選擇
            </option>
            {CASH_POOL_METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">備註（選填）</label>
          <input type="text" name="note" placeholder="補充說明…" className={INPUT_CLASS} />
        </div>

        {state?.error && (
          <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
            {state.error}
          </p>
        )}

        <div className="flex justify-end sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[#BFA074] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:opacity-60"
          >
            {pending ? "儲存中…" : "新增紀錄"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CashPoolTimeline({
  events,
  onDeleted,
}: {
  events: ReturnType<typeof computeCashPoolSummary>["timeline"];
  onDeleted: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(sourceId: string) {
    if (!confirm("確定要刪除這筆手動紀錄嗎？")) return;
    setDeletingId(sourceId);
    const result = await deleteManualCashTransaction(sourceId);
    setDeletingId(null);
    if (result.error) {
      alert(result.error);
      return;
    }
    onDeleted();
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-500">
          <tr>
            <th className="px-4 py-2 font-medium">日期</th>
            <th className="px-4 py-2 font-medium">項目</th>
            <th className="px-4 py-2 font-medium">歸類</th>
            <th className="px-4 py-2 text-right font-medium">金額</th>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {events.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                起算點之後還沒有任何紀錄
              </td>
            </tr>
          )}
          {events.map((e) => (
            <tr key={e.id} className="hover:bg-neutral-50">
              <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-500">{formatDate(e.date)}</td>
              <td className="px-4 py-2 text-neutral-800">
                {e.title}
                {e.detail && <span className="block text-xs font-normal text-neutral-400">{e.detail}</span>}
              </td>
              <td className="whitespace-nowrap px-4 py-2">
                <span
                  className={
                    "rounded px-2 py-1 text-xs font-semibold " +
                    (e.method === "cash" ? "bg-[#FBF1E4] text-[#A6793D]" : "bg-slate-100 text-slate-600")
                  }
                >
                  {e.method === "cash" ? "💵 現金" : "🏦 銀行"}
                </span>
              </td>
              <td
                className={
                  "whitespace-nowrap px-4 py-2 text-right font-bold " +
                  (e.amount >= 0 ? "text-emerald-600" : "text-red-600")
                }
              >
                {e.amount >= 0 ? "+" : "−"}
                {formatCurrency(Math.abs(e.amount))}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right">
                {e.kind === "manual" && (
                  <button
                    type="button"
                    onClick={() => handleDelete(e.sourceId)}
                    disabled={deletingId === e.sourceId}
                    className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
                  >
                    刪除
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
