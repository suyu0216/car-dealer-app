"use client";

// 「每日對帳報表」——2026-09-05 新增，「金流架構方案一」最後一塊，對齊
// Hocar 的每日對帳報表（見這次金流架構開頭的競品落差分析）。核心概念：
// 「未盤點」（今天沒有人數這個帳戶）跟「已盤點差額為 0」（有人數了、
// 數字剛好對得起來）是兩件不一樣的事，畫面要分清楚顯示，不能混在一起。
import { useMemo, useState } from "react";
import type { AccountReconciliation, FinancialAccount } from "@/lib/supabase/types";
import {
  computeAccountBalanceAsOf,
  type CarSlice,
  type CompanyExpenseSlice,
  type DealSlice,
  type ManualTransactionSlice,
  type RepairItemSlice,
} from "@/lib/financial-ledger";
import { formatCurrency, currentTaiwanDateKey } from "@/lib/format";
import { saveAccountReconciliation, deleteAccountReconciliation } from "../account-reconciliations-actions";

/** 每一列「今天要盤點」的輸入框——現金/銀行帳戶各自獨立的受控輸入，
 * 才不會使用者切換帳戶時互相干擾到彼此還沒存檔的草稿。 */
function ReconciliationRow({
  account,
  date,
  systemBalance,
  existing,
  canManage,
  onSaved,
}: {
  account: FinancialAccount;
  date: string;
  systemBalance: number;
  existing: AccountReconciliation | undefined;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [countedInput, setCountedInput] = useState(existing ? String(existing.counted_balance) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const countedValue = countedInput.trim() === "" ? null : Number(countedInput);
  const hasCounted = !!existing;
  const delta = countedValue !== null && Number.isFinite(countedValue) ? countedValue - systemBalance : null;

  async function handleSave() {
    setError("");
    if (countedInput.trim() === "" || !Number.isFinite(Number(countedInput))) {
      setError("請輸入盤點金額。");
      return;
    }
    setSaving(true);
    const formData = new FormData();
    formData.set("account_id", account.id);
    formData.set("date", date);
    formData.set("counted_balance", countedInput);
    formData.set("note", note);
    const result = await saveAccountReconciliation(undefined, formData);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <tr className="hover:bg-neutral-50">
      <td className="whitespace-nowrap px-4 py-2 text-neutral-800">
        <span aria-hidden>{account.type === "cash" ? "💵" : "🏦"}</span> {account.name}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(systemBalance)}</td>
      <td className="whitespace-nowrap px-4 py-2">
        <input
          type="number"
          step="any"
          value={countedInput}
          onChange={(e) => setCountedInput(e.target.value)}
          disabled={!canManage}
          placeholder="輸入實際盤點金額"
          className="w-32 rounded-lg border border-neutral-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none disabled:bg-neutral-50"
        />
      </td>
      <td
        className={
          "whitespace-nowrap px-4 py-2 text-right font-bold " +
          (delta === null ? "text-neutral-300" : delta === 0 ? "text-emerald-600" : "text-red-600")
        }
      >
        {delta === null ? "—" : delta === 0 ? "帳平" : `${delta > 0 ? "+" : "−"}${formatCurrency(Math.abs(delta))}`}
      </td>
      <td className="whitespace-nowrap px-4 py-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!canManage}
          placeholder="備註（選填）"
          className="w-36 rounded-lg border border-neutral-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none disabled:bg-neutral-50"
        />
      </td>
      <td className="whitespace-nowrap px-4 py-2">
        <span
          className={
            "rounded px-2 py-1 text-[11px] font-semibold " +
            (hasCounted ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-400")
          }
        >
          {hasCounted ? "已盤點" : "未盤點"}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right">
        {canManage && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "儲存中…" : hasCounted ? "更新" : "儲存"}
          </button>
        )}
        {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
      </td>
    </tr>
  );
}

export function DailyReconciliationModule({
  accounts,
  reconciliations,
  canManage,
  onDataChanged,
  deals,
  cars,
  repairItems,
  expenses,
  manual,
}: {
  /** 只給還在使用中的帳戶——停用的帳戶不用每天盤點。 */
  accounts: FinancialAccount[];
  /** 全部歷史的盤點紀錄（不分帳戶/日期），這裡自己依日期/帳戶篩選、
   * 分組，不用呼叫端先處理過。 */
  reconciliations: AccountReconciliation[];
  canManage: boolean;
  onDataChanged: () => void;
  deals: DealSlice[];
  cars: CarSlice[];
  repairItems: RepairItemSlice[];
  expenses: CompanyExpenseSlice[];
  manual: ManualTransactionSlice[];
}) {
  const [selectedDate, setSelectedDate] = useState(() => currentTaiwanDateKey());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const ledgerParams = { accounts, deals, cars, repairItems, expenses, manual };

  // 選定日期、每個帳戶「系統應有餘額」——用 computeAccountBalanceAsOf
  // （見 financial-ledger.ts）算截至選定日期為止（含當天）系統認為的
  // 餘額，拿去跟人工盤點比對。
  const systemBalanceByAccountId = useMemo(() => {
    const map = new Map<string, number>();
    for (const account of accounts) {
      map.set(account.id, computeAccountBalanceAsOf(account.id, selectedDate, ledgerParams));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, deals, cars, repairItems, expenses, manual, selectedDate]);

  const reconciliationByKey = useMemo(() => {
    const map = new Map<string, AccountReconciliation>();
    for (const r of reconciliations) {
      map.set(`${r.account_id}:${r.date}`, r);
    }
    return map;
  }, [reconciliations]);

  // 歷史紀錄——由新到舊排序，每一列重新用當時的日期算一次系統應有餘額，
  // 才能算出「當時」的差額（不是用今天的系統餘額去比對過去的盤點）。
  const history = useMemo(() => {
    return [...reconciliations]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map((r) => {
        const systemBalance = computeAccountBalanceAsOf(r.account_id, r.date, ledgerParams);
        const account = accounts.find((a) => a.id === r.account_id);
        return { ...r, systemBalance, accountName: account?.name ?? "（已刪除的帳戶）", delta: r.counted_balance - systemBalance };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconciliations, accounts, deals, cars, repairItems, expenses, manual]);

  const distinctDates = new Set(reconciliations.map((r) => r.date)).size;
  const mismatchCount = history.filter((h) => h.delta !== 0).length;
  const totalAbsDelta = history.reduce((sum, h) => sum + Math.abs(h.delta), 0);

  async function handleDeleteHistory(id: string) {
    if (!confirm("確定要刪除這筆盤點紀錄嗎？刪除後這一天這個帳戶會變回「未盤點」狀態。")) return;
    setDeletingId(id);
    const result = await deleteAccountReconciliation(id);
    setDeletingId(null);
    if (result.error) {
      alert(result.error);
      return;
    }
    onDataChanged();
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <span aria-hidden className="text-lg leading-none">
          ℹ️
        </span>
        <p>
          每天實際數一次現金抽屜、對一次銀行 App 顯示的餘額，填進下面「盤點金額」——系統會拿五個來源自動算出的「應有餘額」跟妳填的數字比對，「差額」不是
          0 就代表這一天這個帳戶帳目對不起來，要找一下原因（漏記一筆、記錯帳戶、手續費忘了記⋯）。沒有盤點紀錄的帳戶會顯示「未盤點」，跟「盤點過、剛好差額是
          0」是兩回事，不要搞混。
        </p>
      </div>

      {/* 選日期＋當天每個帳戶的盤點輸入表 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-neutral-100 pb-3">
          <h2 className="text-base font-semibold text-neutral-800">🧮 盤點日期</h2>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setSelectedDate(currentTaiwanDateKey())}
            className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 hover:border-blue-300 hover:text-blue-700"
          >
            回到今天
          </button>
        </div>

        {accounts.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">尚無帳戶可以盤點，請先到「帳戶管理」新增帳戶。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">帳戶</th>
                  <th className="px-4 py-2 text-right font-medium">系統應有餘額</th>
                  <th className="px-4 py-2 font-medium">盤點金額</th>
                  <th className="px-4 py-2 text-right font-medium">差額</th>
                  <th className="px-4 py-2 font-medium">備註</th>
                  <th className="px-4 py-2 font-medium">狀態</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {accounts.map((account) => (
                  <ReconciliationRow
                    key={account.id}
                    account={account}
                    date={selectedDate}
                    systemBalance={systemBalanceByAccountId.get(account.id) ?? 0}
                    existing={reconciliationByKey.get(`${account.id}:${selectedDate}`)}
                    canManage={canManage}
                    onSaved={onDataChanged}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 對帳歷史——全部帳戶／日期的盤點紀錄，由新到舊。 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
          <h2 className="text-base font-semibold text-neutral-800">📖 對帳歷史</h2>
          <div className="flex flex-wrap gap-4 text-xs text-neutral-500">
            <span>
              對帳天數 <strong className="text-neutral-800">{distinctDates}</strong>
            </span>
            <span>
              盤點筆數 <strong className="text-neutral-800">{history.length}</strong>
            </span>
            <span>
              有差異筆數 <strong className={mismatchCount > 0 ? "text-red-600" : "text-neutral-800"}>{mismatchCount}</strong>
            </span>
            <span>
              差額合計 <strong className={totalAbsDelta > 0 ? "text-red-600" : "text-neutral-800"}>{formatCurrency(totalAbsDelta)}</strong>
            </span>
          </div>
        </div>

        {history.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">目前還沒有任何盤點紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">日期</th>
                  <th className="px-4 py-2 font-medium">帳戶</th>
                  <th className="px-4 py-2 text-right font-medium">系統應有餘額</th>
                  <th className="px-4 py-2 text-right font-medium">盤點金額</th>
                  <th className="px-4 py-2 text-right font-medium">差額</th>
                  <th className="px-4 py-2 font-medium">備註</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-500">{h.date}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-neutral-800">{h.accountName}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(h.systemBalance)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-800">{formatCurrency(h.counted_balance)}</td>
                    <td
                      className={
                        "whitespace-nowrap px-4 py-2 text-right font-bold " +
                        (h.delta === 0 ? "text-emerald-600" : "text-red-600")
                      }
                    >
                      {h.delta === 0 ? "帳平" : `${h.delta > 0 ? "+" : "−"}${formatCurrency(Math.abs(h.delta))}`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-400">{h.note ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => handleDeleteHistory(h.id)}
                          disabled={deletingId === h.id}
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
        )}
      </div>
    </div>
  );
}
