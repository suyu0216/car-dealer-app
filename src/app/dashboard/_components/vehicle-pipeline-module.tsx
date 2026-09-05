"use client";

// 「公積金」——安安自己的說法，指「還沒真的入庫/交車、但已經知道會有」的
// 訂金收支：進貨（車還沒回來，可能已經先付一筆訂金給賣家/車商，車回來
// 還要付尾款）、客戶預訂（客戶預訂一台還沒到貨的車，可能已經先收一筆
// 訂金，交車時還要收尾款）。見 vehicle-pipeline-actions.ts 開頭的完整
// 說明。2026-09-05 追加：這裡原本叫「調車中」，安安反映錢要付出去買車
// 叫「進貨」，這裡跟畫面上的文字都已經統一改成「進貨」。
//
// 2026-09-05 再追加：安安希望這個分頁跟「資金總覽」的水池視覺一樣，一眼
// 看得很清楚，所以把原本 4 張純數字的 StatCard 換成跟 cash-pool-module.tsx
// 同一套「水池」視覺（PipelinePoolCard，浮動波浪＋液面高度代表金額占比），
// 進貨（要付出去的錢）用暖色調、客戶預訂（已收進來的錢）用綠色調，一眼
// 就能分辨方向，細節數字放在液面下方的說明文字裡。
//
// 刻意跟車輛/合約兩張表不綁定——車還沒回來時資料不齊全，沒辦法（也不
// 應該）先建一筆正式車輛/合約紀錄；這裡純粹是記錄／規劃用的清單，車真的
// 到貨/交車了，員工才會用現有的「新增車輛」流程正式建檔，這裡改標記
// 「已完成」即可。
//
// 「訂金是否已經真的入帳」用狀態分開顯示：
// - pending（尚未入帳）：只是先記著，還沒真的動到任何一分錢。
// - deposit_paid（已確認入帳）：透過「確認入帳」動作，系統已經在
//   transactions 表建立一筆真正的手動記帳，資金總覽/帳戶收支明細都會
//   同步反映。
// - fulfilled（已完成）／cancelled（已取消）：這份清單自己的流程結束。
import { useMemo, useState } from "react";
import type { FinancialAccount, VehiclePipelineDirection, VehiclePipelineEntry } from "@/lib/supabase/types";
import { CASH_POOL_METHOD_OPTIONS } from "@/lib/cash-pool";
import { formatCurrency, formatDate, currentTaiwanDateKey } from "@/lib/format";
import {
  createVehiclePipelineEntry,
  updateVehiclePipelineEntry,
  confirmVehiclePipelineDeposit,
  markVehiclePipelineFulfilled,
  markVehiclePipelineCancelled,
  deleteVehiclePipelineEntry,
} from "../vehicle-pipeline-actions";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

const STATUS_LABEL: Record<VehiclePipelineEntry["status"], string> = {
  pending: "尚未入帳",
  deposit_paid: "已確認入帳",
  fulfilled: "已完成",
  cancelled: "已取消",
};
const STATUS_STYLE: Record<VehiclePipelineEntry["status"], string> = {
  pending: "bg-neutral-100 text-neutral-500",
  deposit_paid: "bg-emerald-50 text-emerald-700",
  fulfilled: "bg-blue-50 text-blue-600",
  cancelled: "bg-red-50 text-red-500",
};

// 「水池」視覺，跟 cash-pool-module.tsx 的 PoolCard 同一套做法：液面高度
// 依金額占 scaleMax 的比例撐開，讓兩個方向（進貨要付出去／客戶預訂已收
// 進來）一眼就能比較大小、看得很清楚，不用細看數字。tone="outflow" 用
// 暖橘色（錢要出去），tone="inflow" 用綠色（錢已經進來）。
function PipelinePoolCard({
  label,
  icon,
  amount,
  caption,
  scaleMax,
  tone,
}: {
  label: string;
  icon: string;
  amount: number;
  caption: string;
  scaleMax: number;
  tone: "outflow" | "inflow";
}) {
  const pct = Math.max(6, Math.min(100, (amount / scaleMax) * 100));
  const gradient =
    tone === "outflow"
      ? "linear-gradient(180deg, #EDA97A 0%, #D97757 55%, #B85C3E 100%)"
      : "linear-gradient(180deg, #93C6A4 0%, #5F9C74 55%, #3F7A57 100%)";
  const waveColor = "rgba(255,255,255,0.32)";

  return (
    <div className="relative h-56 overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
      <div
        className="absolute inset-x-0 bottom-0 transition-all duration-700 ease-out"
        style={{ height: `${pct}%`, background: gradient }}
      >
        <svg
          className="absolute -top-3 left-0 h-4 w-[200%] animate-[pipeline-pool-wave_7s_linear_infinite]"
          viewBox="0 0 400 20"
          preserveAspectRatio="none"
        >
          <path d="M0 10 Q50 20 100 10 T200 10 T300 10 T400 10 V20 H0 Z" fill={waveColor} />
        </svg>
        <svg
          className="absolute -top-2 left-0 h-4 w-[200%] animate-[pipeline-pool-wave_11s_linear_infinite_reverse]"
          viewBox="0 0 400 20"
          preserveAspectRatio="none"
        >
          <path d="M0 12 Q50 4 100 12 T200 12 T300 12 T400 12 V20 H0 Z" fill="rgba(255,255,255,0.18)" />
        </svg>
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <span aria-hidden>{icon}</span>
          {label}
        </div>
        <div>
          <p className={"text-3xl font-bold " + (pct > 45 ? "text-white drop-shadow-sm" : "text-neutral-900")}>
            {formatCurrency(amount)}
          </p>
          <p className={"mt-1 text-xs " + (pct > 45 ? "text-white/85" : "text-neutral-500")}>{caption}</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes pipeline-pool-wave {
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

export function VehiclePipelineModule({
  entries,
  financialAccounts,
  canRecord,
  canConfirmDeposit,
  onDataChanged,
}: {
  entries: VehiclePipelineEntry[];
  financialAccounts: FinancialAccount[];
  /** canEditCars || canManageFinance——新增/編輯/標記完成/取消/刪除。 */
  canRecord: boolean;
  /** canManageFinance——確認訂金入帳（會真的動到收支明細）。 */
  canConfirmDeposit: boolean;
  onDataChanged: () => void;
}) {
  const purchaseEntries = useMemo(
    () => entries.filter((e) => e.direction === "purchase").sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [entries]
  );
  const preorderEntries = useMemo(
    () => entries.filter((e) => e.direction === "preorder").sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [entries]
  );

  // 「即將要出去的錢」：進貨還沒真的付出去的訂金（pending）＋所有還在
  // 進行中（pending/deposit_paid）紀錄的預計尾款——這兩塊都是「還沒發生
  // 但已經知道會有」的支出。
  const purchasePendingDeposit = purchaseEntries
    .filter((e) => e.status === "pending")
    .reduce((sum, e) => sum + e.deposit_amount, 0);
  const purchaseActiveBalance = purchaseEntries
    .filter((e) => e.status === "pending" || e.status === "deposit_paid")
    .reduce((sum, e) => sum + Number(e.expected_balance_amount ?? 0), 0);
  const upcomingOutflow = purchasePendingDeposit + purchaseActiveBalance;

  // 「已經預收的錢」：客戶預訂裡已經確認入帳（真的收到）、但車還沒交出去
  // 的訂金——這筆錢已經在她手上，但還「欠」客戶一台車。
  const alreadyCollected = preorderEntries
    .filter((e) => e.status === "deposit_paid")
    .reduce((sum, e) => sum + e.deposit_amount, 0);

  // 「預計還要收的錢」：客戶預訂還在進行中的尾款＋還沒收的訂金，跟
  // upcomingOutflow 同一個算法，方向相反。
  const preorderPendingDeposit = preorderEntries
    .filter((e) => e.status === "pending")
    .reduce((sum, e) => sum + e.deposit_amount, 0);
  const preorderActiveBalance = preorderEntries
    .filter((e) => e.status === "pending" || e.status === "deposit_paid")
    .reduce((sum, e) => sum + Number(e.expected_balance_amount ?? 0), 0);
  const upcomingInflow = preorderPendingDeposit + preorderActiveBalance;

  const activePurchaseCount = purchaseEntries.filter((e) => e.status === "pending" || e.status === "deposit_paid").length;
  const activePreorderCount = preorderEntries.filter((e) => e.status === "pending" || e.status === "deposit_paid").length;

  // 兩個水池共用同一把尺，讓「進貨要付出去」跟「客戶預訂已收進來」的
  // 液面高度可以直接比大小，跟 cash-pool-module.tsx 的 scaleMax 算法一致。
  const pipelineScaleMax = Math.max(upcomingOutflow, alreadyCollected, 1) * 1.15;

  return (
    <div className="space-y-6">
      <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <span aria-hidden className="text-lg leading-none">
          ℹ️
        </span>
        <p>
          「公積金」是給還沒真的入庫/交車、但已經知道會有的訂金收支用的規劃清單：<strong>進貨</strong>
          ——車還沒回來，可能已經先付一筆訂金給賣家；<strong>客戶預訂</strong>——客戶預訂一台還沒到貨的車，可能已經先收一筆訂金。這裡刻意不跟正式的車輛/合約資料綁在一起，車真的到貨/交車了，還是要用「新增車輛」／「買賣合約」正式建檔，這裡只要標記「已完成」即可。訂金填進來只是先記錄，不會馬上影響資金總覽——要等妳按「確認入帳」，系統才會真的補一筆收支紀錄進去。
        </p>
      </div>

      {/* 兩個「水池」——跟「資金總覽」同一套視覺，液面高度代表金額大小，
          一眼就能看出進貨要付出去的錢、客戶預訂已經收進來的錢，哪個比較
          多，不用細看數字。 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PipelinePoolCard
          label="進貨（要付出去的錢）"
          icon="📦"
          amount={upcomingOutflow}
          caption={`待付訂金 ${formatCurrency(purchasePendingDeposit)} ・待付尾款 ${formatCurrency(
            purchaseActiveBalance
          )} ・進行中 ${activePurchaseCount} 筆`}
          scaleMax={pipelineScaleMax}
          tone="outflow"
        />
        <PipelinePoolCard
          label="客戶預訂（已收進來的錢）"
          icon="🧾"
          amount={alreadyCollected}
          caption={`預計還要收 ${formatCurrency(upcomingInflow)} ・進行中 ${activePreorderCount} 筆`}
          scaleMax={pipelineScaleMax}
          tone="inflow"
        />
      </div>

      {canRecord && <NewEntryForm onCreated={onDataChanged} />}

      <PipelineSection
        title="📦 進貨（訂金支出）"
        emptyText="目前沒有進貨中的紀錄"
        entries={purchaseEntries}
        financialAccounts={financialAccounts}
        canRecord={canRecord}
        canConfirmDeposit={canConfirmDeposit}
        onDataChanged={onDataChanged}
      />
      <PipelineSection
        title="🧾 客戶預訂（訂金收入）"
        emptyText="目前沒有客戶預訂的紀錄"
        entries={preorderEntries}
        financialAccounts={financialAccounts}
        canRecord={canRecord}
        canConfirmDeposit={canConfirmDeposit}
        onDataChanged={onDataChanged}
      />
    </div>
  );
}

function NewEntryForm({ onCreated }: { onCreated: () => void }) {
  const [direction, setDirection] = useState<VehiclePipelineDirection>("purchase");
  const [vehicleDescription, setVehicleDescription] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [expectedBalance, setExpectedBalance] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isPurchase = direction === "purchase";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!vehicleDescription.trim()) {
      setError("請輸入車型說明。");
      return;
    }
    setSubmitting(true);
    const formData = new FormData();
    formData.set("direction", direction);
    formData.set("vehicle_description", vehicleDescription.trim());
    formData.set("counterparty_name", counterpartyName);
    formData.set("deposit_amount", depositAmount);
    formData.set("expected_balance_amount", expectedBalance);
    formData.set("expected_date", expectedDate);
    formData.set("note", note);
    const result = await createVehiclePipelineEntry(undefined, formData);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setVehicleDescription("");
    setCounterpartyName("");
    setDepositAmount("");
    setExpectedBalance("");
    setExpectedDate("");
    setNote("");
    onCreated();
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 border-b pb-3 text-base font-semibold text-neutral-800">➕ 新增公積金紀錄</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDirection("purchase")}
            className={
              "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition " +
              (isPurchase ? "border-[#BFA074] bg-[#FBF1E4] text-[#A6793D]" : "border-neutral-200 text-neutral-500")
            }
          >
            📦 進貨（要付出去）
          </button>
          <button
            type="button"
            onClick={() => setDirection("preorder")}
            className={
              "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition " +
              (!isPurchase ? "border-[#BFA074] bg-[#FBF1E4] text-[#A6793D]" : "border-neutral-200 text-neutral-500")
            }
          >
            🧾 客戶預訂（要收進來）
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-600">車型說明</label>
          <input
            value={vehicleDescription}
            onChange={(e) => setVehicleDescription(e.target.value)}
            placeholder="例如：2020 BMW X3 白色"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-600">{isPurchase ? "賣家/車商（選填）" : "客戶姓名（選填）"}</label>
          <input value={counterpartyName} onChange={(e) => setCounterpartyName(e.target.value)} className={INPUT_CLASS} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-bold text-neutral-600">訂金金額</label>
            <input
              type="number"
              min={0}
              step="any"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-600">預計尾款（選填）</label>
            <input
              type="number"
              min={0}
              step="any"
              value={expectedBalance}
              onChange={(e) => setExpectedBalance(e.target.value)}
              placeholder="還不確定可以先不填"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-600">{isPurchase ? "預計到貨日（選填）" : "預計交車日（選填）"}</label>
          <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={INPUT_CLASS} />
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-600">備註（選填）</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT_CLASS + " resize-y"} />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-[#BFA074] py-2.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "儲存中…" : "新增紀錄"}
        </button>
      </form>
    </div>
  );
}

function PipelineSection({
  title,
  emptyText,
  entries,
  financialAccounts,
  canRecord,
  canConfirmDeposit,
  onDataChanged,
}: {
  title: string;
  emptyText: string;
  entries: VehiclePipelineEntry[];
  financialAccounts: FinancialAccount[];
  canRecord: boolean;
  canConfirmDeposit: boolean;
  onDataChanged: () => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleFulfilled(id: string) {
    setBusyId(id);
    const result = await markVehiclePipelineFulfilled(id);
    setBusyId(null);
    if (result.error) alert(result.error);
    else onDataChanged();
  }
  async function handleCancelled(id: string) {
    if (!confirm("確定要把這筆紀錄標記為取消嗎？")) return;
    setBusyId(id);
    const result = await markVehiclePipelineCancelled(id);
    setBusyId(null);
    if (result.error) alert(result.error);
    else onDataChanged();
  }
  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這筆紀錄嗎？")) return;
    setBusyId(id);
    const result = await deleteVehiclePipelineEntry(id);
    setBusyId(null);
    if (result.error) alert(result.error);
    else onDataChanged();
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 border-b pb-3 text-base font-semibold text-neutral-800">{title}</h2>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {entries.map((entry) => (
            <li key={entry.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-neutral-900">{entry.vehicle_description}</span>
                    <span className={"rounded px-2 py-0.5 text-[11px] font-semibold " + STATUS_STYLE[entry.status]}>
                      {STATUS_LABEL[entry.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {entry.counterparty_name && <span>{entry.counterparty_name}・</span>}
                    訂金 {formatCurrency(entry.deposit_amount)}
                    {entry.expected_balance_amount != null && <span>・預計尾款 {formatCurrency(entry.expected_balance_amount)}</span>}
                    {entry.expected_date && <span>・預計 {formatDate(entry.expected_date)}</span>}
                  </p>
                  {entry.deposit_paid_at && (
                    <p className="mt-0.5 text-xs text-emerald-600">已於 {formatDate(entry.deposit_paid_at)} 確認入帳</p>
                  )}
                  {entry.note && <p className="mt-0.5 text-xs text-neutral-400">{entry.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs font-medium">
                  {entry.status === "pending" && canConfirmDeposit && (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(confirmingId === entry.id ? null : entry.id)}
                      className="rounded-lg border border-blue-300 px-2.5 py-1 font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      {confirmingId === entry.id ? "取消" : "確認入帳"}
                    </button>
                  )}
                  {canRecord && (entry.status === "pending" || entry.status === "deposit_paid") && (
                    <button
                      type="button"
                      disabled={busyId === entry.id}
                      onClick={() => handleFulfilled(entry.id)}
                      className="text-neutral-400 hover:text-blue-600 disabled:opacity-40"
                    >
                      標記完成
                    </button>
                  )}
                  {canRecord && entry.status !== "cancelled" && entry.status !== "fulfilled" && (
                    <button
                      type="button"
                      disabled={busyId === entry.id}
                      onClick={() => handleCancelled(entry.id)}
                      className="text-neutral-400 hover:text-red-600 disabled:opacity-40"
                    >
                      取消
                    </button>
                  )}
                  {canRecord && entry.status === "pending" && (
                    <button
                      type="button"
                      disabled={busyId === entry.id}
                      onClick={() => handleDelete(entry.id)}
                      className="text-neutral-300 hover:text-red-600 disabled:opacity-40"
                    >
                      刪除
                    </button>
                  )}
                </div>
              </div>
              {confirmingId === entry.id && (
                <ConfirmDepositForm
                  entry={entry}
                  financialAccounts={financialAccounts}
                  onDone={() => {
                    setConfirmingId(null);
                    onDataChanged();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfirmDepositForm({
  entry,
  financialAccounts,
  onDone,
}: {
  entry: VehiclePipelineEntry;
  financialAccounts: FinancialAccount[];
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(entry.deposit_amount));
  const [date, setDate] = useState(() => currentTaiwanDateKey());
  const [paymentMethod, setPaymentMethod] = useState(CASH_POOL_METHOD_OPTIONS[0].value);
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const formData = new FormData();
    formData.set("entry_id", entry.id);
    formData.set("date", date);
    formData.set("payment_method", paymentMethod);
    formData.set("amount", amount);
    formData.set("account_id", accountId);
    formData.set("note", note);
    const result = await confirmVehiclePipelineDeposit(undefined, formData);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
      <p className="text-xs text-blue-900">
        確認之後會在收支明細建立一筆真正的{entry.direction === "purchase" ? "支出" : "收入"}紀錄，資金總覽/帳戶餘額會馬上跟著變動，請確認金額跟日期正確。
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-bold text-neutral-600">實際入帳金額</label>
          <input
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-neutral-600">入帳日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-bold text-neutral-600">現金／銀行</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          >
            {CASH_POOL_METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-neutral-600">帳戶（選填）</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">不指定帳戶</option>
            {financialAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.type === "cash" ? "💵" : "🏦"} {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold text-neutral-600">備註（選填）</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "確認中…" : "確認已入帳"}
      </button>
    </form>
  );
}
