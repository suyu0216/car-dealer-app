"use client";

import { useMemo, useState } from "react";
import type { FinancialAccount } from "@/lib/supabase/types";
import {
  computeFinancialLedger,
  type AccountLedger,
  type CarSlice,
  type CompanyExpenseSlice,
  type DealSlice,
  type ManualTransactionSlice,
  type RepairItemSlice,
} from "@/lib/financial-ledger";
import { formatCurrency, formatDate, currentTaiwanDateKey, taiwanDateParts } from "@/lib/format";
import {
  createFinancialAccount,
  updateFinancialAccount,
  deactivateFinancialAccount,
  reactivateFinancialAccount,
} from "../financial-accounts-actions";
import { voidManualCashTransaction } from "../cash-pool-actions";

const KIND_LABEL: Record<AccountLedger["events"][number]["kind"], string> = {
  deal_income: "成交收款",
  car_expense: "進貨付款",
  repair_expense: "請款撥款",
  company_expense: "公司開銷",
  manual: "手動紀錄",
};

/** 「本月／上月」快速篩選按鈕用——算出某個月份（0＝本月，-1＝上月……）
 * 完整的起訖日期（YYYY-MM-DD）。用 taiwanDateParts 先拿到「現在」在台灣
 * 時區的年/月，避免容器所在時區跨日造成算錯月份。 */
function monthRange(offsetMonths: number): { start: string; end: string } {
  const { year, month } = taiwanDateParts(new Date());
  const y = year;
  const m0 = month - 1 + offsetMonths; // 0-indexed，可能是負數或超過 11，Date 會自動進位/借位
  const firstOfMonth = new Date(Date.UTC(y, m0, 1));
  const firstOfNextMonth = new Date(Date.UTC(y, m0 + 1, 1));
  const lastOfMonth = new Date(firstOfNextMonth.getTime() - 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${firstOfMonth.getUTCFullYear()}-${pad(firstOfMonth.getUTCMonth() + 1)}-${pad(1)}`;
  const end = `${lastOfMonth.getUTCFullYear()}-${pad(lastOfMonth.getUTCMonth() + 1)}-${pad(lastOfMonth.getUTCDate())}`;
  return { start, end };
}

type DateRangePreset = "all" | "thisMonth" | "lastMonth" | "custom";

/** 把收支明細匯出成 CSV，用 Blob + 隱藏 <a> 觸發瀏覽器下載，不需要任何
 * 額外套件。Excel 開啟中文 CSV 容易亂碼，前面加 UTF-8 BOM 避免這個問題。 */
function downloadLedgerCsv(account: FinancialAccount, ledger: AccountLedger) {
  const header = ["日期", "項目", "備註", "來源", "金額", "狀態"];
  const rows = ledger.events.map((e) => [
    e.date.slice(0, 10),
    e.title,
    e.detail ?? "",
    KIND_LABEL[e.kind],
    String(e.amount),
    e.isVoided ? "已作廢" : e.isReversal ? "沖銷" : "",
  ]);
  const csv =
    "﻿" +
    [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${account.name}-收支明細-${currentTaiwanDateKey()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * 帳戶管理——2026-09-04 新增，「金流架構方案一」使用者看得到的 UI（見
 * financial-accounts-actions.ts 開頭的說明）。這裡除了「帳戶本身」的
 * 新增/改名/停用，也包含「收支明細」——合約收款／進貨付款／請款撥款／
 * 公司開銷／手動記帳五個來源只要有標記帳戶，都會算進每個帳戶的餘額跟
 * 明細裡（見 financial-ledger.ts 開頭的說明）。
 */
export function FinancialAccountsModule({
  accounts,
  canManage,
  onDataChanged,
  deals,
  cars,
  repairItems,
  expenses,
  manual,
}: {
  accounts: FinancialAccount[];
  /** 只有 canManageFinance 的人才能新增/改名/停用帳戶，跟公司開銷同一套
   * 權限，見 accounting/page.tsx 呼叫這個元件的地方。 */
  canManage: boolean;
  onDataChanged: () => void;
  /** 2026-09-05 改法：原本外面（accounting/page.tsx）直接呼叫一次
   * computeFinancialLedger() 算好整份 ledgers 傳進來；現在改成把五個原始
   * 來源直接傳進來，這裡自己呼叫兩次 computeFinancialLedger()——一次不帶
   * dateRange（全部歷史，帳戶清單「目前餘額」用，不受下面的日期篩選
   * 影響）、一次帶使用者選的 dateRange（收支明細篩選後的期初/期末/入帳/
   * 出帳用），這樣「收支明細」才能做互動式的日期區間篩選，跟 Hocar 的
   * 帳戶收支明細報表同一個概念。 */
  deals: DealSlice[];
  cars: CarSlice[];
  repairItems: RepairItemSlice[];
  expenses: CompanyExpenseSlice[];
  manual: ManualTransactionSlice[];
}) {
  const [name, setName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editOpeningBalance, setEditOpeningBalance] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = [...accounts].sort((a, b) => {
    // 現金固定排最前面，其餘照 sort_order（新增順序）排列。
    if (a.type !== b.type) return a.type === "cash" ? -1 : 1;
    return a.sort_order - b.sort_order;
  });

  // 2026-09-05 新增：收支明細的日期區間篩選。preset 決定顯示哪一組
  // 起訖日期；"custom" 才會讓使用者自己填 customStart/customEnd。"all"
  // （預設）維持原本「不篩選、看全部歷史」的行為。
  const [rangePreset, setRangePreset] = useState<DateRangePreset>("all");
  const [customStart, setCustomStart] = useState(() => monthRange(0).start);
  const [customEnd, setCustomEnd] = useState(() => currentTaiwanDateKey());

  const activeRange: { start: string | null; end: string | null } = useMemo(() => {
    if (rangePreset === "all") return { start: null, end: null };
    if (rangePreset === "thisMonth") return monthRange(0);
    if (rangePreset === "lastMonth") return monthRange(-1);
    return { start: customStart || null, end: customEnd || null };
  }, [rangePreset, customStart, customEnd]);

  const ledgerParams = { accounts, deals, cars, repairItems, expenses, manual };
  // 全部歷史（不受日期篩選影響）——帳戶清單裡「目前餘額」這行永遠顯示
  // 帳戶真正的當前餘額，不會因為使用者在下面選了某個月份就跟著變。
  const allLedgers: AccountLedger[] = useMemo(
    () => computeFinancialLedger(ledgerParams),
    [accounts, deals, cars, repairItems, expenses, manual]
  );
  // 篩選後（收支明細的期初/期末/入帳/出帳/明細列表用）。
  const filteredLedgers: AccountLedger[] = useMemo(
    () => computeFinancialLedger({ ...ledgerParams, dateRange: activeRange }),
    [accounts, deals, cars, repairItems, expenses, manual, activeRange]
  );

  const ledgerByAccountId = new Map(allLedgers.map((l) => [l.account.id, l]));
  const filteredLedgerByAccountId = new Map(filteredLedgers.map((l) => [l.account.id, l]));

  // 「收支明細」目前選的是哪個帳戶——預設選排序後的第一個帳戶（通常是
  // 現金），沒有帳戶時維持 null。
  //
  // 2026-09-05 修正：安安實測發現「收支明細」表格完全不會顯示（下拉選單
  // 看起來已經選了「現金」，但底下的統計卡跟明細表就是空的）。根本原因
  // 是這裡原本直接把 sorted[0]?.id 當 useState 的初始值——但這個元件是
  // 在 accounting/page.tsx 判斷「網址帶 ?module=accounts」就切分頁時掛載
  // 的（見該檔案），而那個判斷只等 hasFinanceAccess 確定，不等
  // financialAccounts 資料真的抓回來；如果使用者是直接用
  // /dashboard/accounting?module=accounts 這種網址深連結進來，這個元件
  // 很可能在 accounts 陣列還是空陣列的當下就先掛載一次，useState 的初始
  // 值因此被鎖定成 null（undefined ?? null）。之後 financialAccounts
  // 資料非同步抓回來、accounts/sorted 陣列有值了，selectedAccountId 這個
  // useState 卻不會跟著重新計算初始值（React 的行為本來就是這樣，
  // initializer 只在第一次掛載時跑一次）——變成永遠卡在 null，
  // selectedLedger 也就永遠是 undefined，整個統計卡＋明細表 conditional
  // 區塊完全不會渲染。畫面上的下拉選單看起來卻像已經選到「現金」，是因為
  // <select> 原生行為：value 是空字串又找不到對應的空值 option 時，瀏覽器
  // 會自動 fallback 顯示第一個 option，讓人誤以為狀態是對的。
  //
  // 修法：不要相信「只在掛載當下算一次」的 useState 初始值，改成每次
  // render 都用目前的 sorted 陣列即時算出一個有效的選取 id（優先用使用者
  // 自己選過、而且現在還存在於 ledgerByAccountId 裡的 selectedAccountId；
  // 否則 fallback 回 sorted[0]?.id）——這樣不管元件是不是在資料還沒回來
  // 之前就搶先掛載，一旦資料真的到了，畫面下一次 render 就會自動修正，
  // 不會卡死。
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const effectiveSelectedId =
    selectedAccountId && ledgerByAccountId.has(selectedAccountId) ? selectedAccountId : (sorted[0]?.id ?? null);
  const selectedLedger = effectiveSelectedId ? filteredLedgerByAccountId.get(effectiveSelectedId) : undefined;
  const selectedAccount = effectiveSelectedId ? (accounts.find((a) => a.id === effectiveSelectedId) ?? null) : null;

  const [voidingId, setVoidingId] = useState<string | null>(null);

  // 2026-09-05 新增：手動記帳的「作廢」——跟「資金總覽」時間軸那顆按鈕
  // 呼叫同一支 action，理由跟防呆邏輯都寫在 cash-pool-actions.ts 的
  // voidManualCashTransaction() 開頭。
  async function handleVoidManual(sourceId: string) {
    if (!confirm("確定要作廢這筆手動紀錄嗎？系統會保留原始紀錄，並自動新增一筆金額相反的沖銷紀錄，兩筆都會留底可查。"))
      return;
    setVoidingId(sourceId);
    const result = await voidManualCashTransaction(sourceId);
    setVoidingId(null);
    if (result.error) {
      alert(result.error);
      return;
    }
    onDataChanged();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) {
      setFormError("請輸入帳戶名稱。");
      return;
    }
    setSubmitting(true);
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("opening_balance", openingBalance);
    formData.set("note", note);
    const result = await createFinancialAccount(undefined, formData);
    if (result.error) {
      setFormError(result.error);
    } else {
      setName("");
      setOpeningBalance("");
      setNote("");
      onDataChanged();
    }
    setSubmitting(false);
  }

  function startEdit(account: FinancialAccount) {
    setEditingId(account.id);
    setEditName(account.name);
    setEditOpeningBalance(String(account.opening_balance));
    setEditNote(account.note ?? "");
    setEditError("");
  }

  async function handleSaveEdit(accountId: string) {
    setEditError("");
    if (!editName.trim()) {
      setEditError("請輸入帳戶名稱。");
      return;
    }
    setSavingEdit(true);
    const formData = new FormData();
    formData.set("account_id", accountId);
    formData.set("name", editName.trim());
    formData.set("opening_balance", editOpeningBalance);
    formData.set("note", editNote);
    const result = await updateFinancialAccount(undefined, formData);
    if (result.error) {
      setEditError(result.error);
    } else {
      setEditingId(null);
      onDataChanged();
    }
    setSavingEdit(false);
  }

  async function handleDeactivate(account: FinancialAccount) {
    if (!confirm(`確定要停用帳戶「${account.name}」嗎？停用後不會出現在新增收支的帳戶選單，但歷史資料會保留。`)) return;
    setBusyId(account.id);
    const result = await deactivateFinancialAccount(account.id);
    if (result.error) alert(`停用失敗：${result.error}`);
    else onDataChanged();
    setBusyId(null);
  }

  async function handleReactivate(account: FinancialAccount) {
    setBusyId(account.id);
    const result = await reactivateFinancialAccount(account.id);
    if (result.error) alert(`啟用失敗：${result.error}`);
    else onDataChanged();
    setBusyId(null);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* 說明橫幅——沿用「淨利／分潤試算」那份 info banner 的作法，先講清楚
          這一步跟既有功能的關係，避免使用者以為新增帳戶後舊資料會自動
          被歸類，或以為舊版資金總覽（現金/銀行水位）會被取代。 */}
      <div className="lg:col-span-3 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <span aria-hidden className="text-lg leading-none">
          ℹ️
        </span>
        <p>
          這裡是新的「多帳戶」金流架構：把妳實際的銀行帳戶（可以有兩個以上）建起來、自己命名。成交收款（訂金/尾款）／進貨付款／請款撥款／公司開銷／手動記帳，五個地方新增或編輯時都可以選填指定帳戶，下方帳戶餘額跟收支明細會反映<strong>所有已標記帳戶的紀錄</strong>；沒有標記帳戶的資料（不管是新資料沒選、還是這個功能上線之前的舊資料）不會被算進來，不用回頭補填。既有的「資金總覽（現金／銀行水位）」分頁不受影響、照常運作，不會被取代，兩邊算法各自獨立。現金帳戶是系統自動建立、每間車行固定一個，不能刪除或停用。
        </p>
      </div>

      {/* 左側：新增銀行帳戶表單 */}
      {canManage && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 border-b pb-3 text-lg font-bold text-neutral-900">➕ 新增銀行帳戶</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-neutral-600">帳戶名稱</label>
              <input
                type="text"
                placeholder="例如：國泰世華-1234"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
              <p className="mt-1 text-[11px] text-neutral-400">自己看得懂就好，不一定要填完整的開戶行/帳號。</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-neutral-600">期初餘額（選填）</label>
              <input
                type="number"
                step="1"
                placeholder="0"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-neutral-600">備註（選填）</label>
              <textarea
                rows={2}
                placeholder="補充說明..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            {formError && <p className="text-xs text-red-500">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-blue-600 py-2.5 font-bold text-white shadow transition hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "新增中…" : "新增帳戶"}
            </button>
          </form>
        </div>
      )}

      {/* 右側：帳戶清單 */}
      <div className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ${canManage ? "lg:col-span-2" : "lg:col-span-3"}`}>
        <h2 className="mb-4 border-b pb-3 text-lg font-bold text-neutral-900">🏦 帳戶清單</h2>
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">尚無帳戶資料</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {sorted.map((account) => {
              const isEditing = editingId === account.id;
              return (
                <li key={account.id} className="py-3">
                  {isEditing ? (
                    <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="1"
                          value={editOpeningBalance}
                          onChange={(e) => setEditOpeningBalance(e.target.value)}
                          className="w-1/2 rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                          placeholder="期初餘額"
                        />
                        <input
                          type="text"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          className="w-1/2 rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                          placeholder="備註"
                        />
                      </div>
                      {editError && <p className="text-xs text-red-500">{editError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={() => handleSaveEdit(account.id)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingEdit ? "儲存中…" : "儲存"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span aria-hidden>{account.type === "cash" ? "💵" : "🏦"}</span>
                          <span className={`font-semibold ${account.is_active ? "text-neutral-900" : "text-neutral-400 line-through"}`}>
                            {account.name}
                          </span>
                          {!account.is_active && (
                            <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                              已停用
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-400">
                          期初餘額 ${Number(account.opening_balance).toLocaleString()}
                          {account.note && ` ・ ${account.note}`}
                        </p>
                        {(() => {
                          const ledger = ledgerByAccountId.get(account.id);
                          if (!ledger || ledger.events.length === 0) return null;
                          return (
                            <p className="mt-0.5 text-xs font-semibold text-neutral-600">
                              目前餘額 ${ledger.balance.toLocaleString()}
                              <span className="ml-1 font-normal text-neutral-400">
                                （入帳 ${ledger.inflow.toLocaleString()}・出帳 ${ledger.outflow.toLocaleString()}，共 {ledger.events.length} 筆）
                              </span>
                            </p>
                          );
                        })()}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => setSelectedAccountId(account.id)}
                          className={
                            "rounded-lg border px-2.5 py-1 font-semibold transition " +
                            (effectiveSelectedId === account.id
                              ? "border-blue-300 bg-blue-50 text-blue-700"
                              : "border-neutral-200 text-neutral-500 hover:border-blue-300 hover:text-blue-700")
                          }
                        >
                          📒 收支明細
                        </button>
                        {canManage && (
                          <>
                            <button type="button" onClick={() => startEdit(account)} className="text-neutral-400 hover:text-blue-600">
                              編輯
                            </button>
                            {account.type === "bank" &&
                              (account.is_active ? (
                                <button
                                  type="button"
                                  disabled={busyId === account.id}
                                  onClick={() => handleDeactivate(account)}
                                  className="text-neutral-400 hover:text-red-600 disabled:opacity-40"
                                >
                                  停用
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busyId === account.id}
                                  onClick={() => handleReactivate(account)}
                                  className="text-neutral-400 hover:text-green-600 disabled:opacity-40"
                                >
                                  啟用
                                </button>
                              ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 收支明細——選一個帳戶，列出五個來源裡所有標記這個帳戶的紀錄，
          由新到舊排序，跟「資金總覽」水池的時間軸同一套排版風格。
          2026-09-05 新增：日期區間篩選（本月/上月/自訂/全部）＋匯出 CSV，
          對齊 Hocar「帳戶收支明細」報表的做法。 */}
      {sorted.length > 0 && (
        <div className="lg:col-span-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-800">📒 收支明細</h2>
            <select
              value={effectiveSelectedId ?? ""}
              onChange={(e) => setSelectedAccountId(e.target.value || null)}
              className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              {sorted.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.type === "cash" ? "💵" : "🏦"} {a.name}
                  {!a.is_active ? "（已停用）" : ""}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
              {(
                [
                  { key: "all", label: "全部" },
                  { key: "thisMonth", label: "本月" },
                  { key: "lastMonth", label: "上月" },
                  { key: "custom", label: "自訂" },
                ] as { key: DateRangePreset; label: string }[]
              ).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setRangePreset(p.key)}
                  className={
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition " +
                    (rangePreset === p.key ? "bg-white text-blue-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800")
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>

            {rangePreset === "custom" && (
              <div className="flex items-center gap-1.5 text-xs">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                />
                <span className="text-neutral-400">～</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {selectedLedger && selectedAccount && (
              <button
                type="button"
                onClick={() => downloadLedgerCsv(selectedAccount, selectedLedger)}
                disabled={selectedLedger.events.length === 0}
                className="ml-auto rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ⬇️ 匯出 CSV
              </button>
            )}
          </div>

          {rangePreset !== "all" && (
            <p className="text-xs text-neutral-400">
              篩選區間：{activeRange.start ?? "—"} ～ {activeRange.end ?? "—"}（「目前餘額」是帳戶全部歷史的真實餘額，不受這個篩選影響；下面的期初/期末/入帳/出帳跟明細才是這段區間的數字）
            </p>
          )}

          {selectedLedger && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label={rangePreset === "all" ? "期初餘額" : "區間期初"} value={selectedLedger.opening} tone="neutral" />
                <StatCard label="累計入帳" value={selectedLedger.inflow} tone="up" prefix="+" />
                <StatCard label="累計出帳" value={selectedLedger.outflow} tone="down" prefix="−" />
                <StatCard label={rangePreset === "all" ? "目前餘額" : "區間期末"} value={selectedLedger.balance} tone="strong" />
              </div>

              <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">日期</th>
                      <th className="px-4 py-2 font-medium">項目</th>
                      <th className="px-4 py-2 font-medium">來源</th>
                      <th className="px-4 py-2 text-right font-medium">金額</th>
                      <th className="px-4 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {selectedLedger.events.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                          {rangePreset === "all" ? "這個帳戶目前還沒有任何標記過的收支紀錄" : "這段期間這個帳戶沒有任何標記過的收支紀錄"}
                        </td>
                      </tr>
                    )}
                    {selectedLedger.events.map((e) => (
                      <tr key={e.id} className="hover:bg-neutral-50">
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-500">{formatDate(e.date)}</td>
                        <td className="px-4 py-2 text-neutral-800">
                          {e.title}
                          {e.isVoided && (
                            <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400 line-through decoration-neutral-400">
                              已作廢
                            </span>
                          )}
                          {e.isReversal && (
                            <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                              沖銷
                            </span>
                          )}
                          {e.detail && <span className="block text-xs font-normal text-neutral-400">{e.detail}</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <span className="rounded bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-600">
                            {KIND_LABEL[e.kind]}
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
                          {e.kind === "manual" && !e.isVoided && !e.isReversal && (
                            <button
                              type="button"
                              onClick={() => handleVoidManual(e.sourceId)}
                              disabled={voidingId === e.sourceId}
                              className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
                            >
                              作廢
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 「收支明細」上方的四格統計卡（期初/入帳/出帳/餘額），跟其餘分頁的
 * 數字卡片風格一致。 */
function StatCard({
  label,
  value,
  tone,
  prefix,
}: {
  label: string;
  value: number;
  tone: "neutral" | "up" | "down" | "strong";
  prefix?: string;
}) {
  const toneClass =
    tone === "up"
      ? "text-emerald-600"
      : tone === "down"
        ? "text-red-600"
        : tone === "strong"
          ? "text-neutral-900"
          : "text-neutral-600";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-[11px] font-medium text-neutral-400">{label}</p>
      <p className={`mt-1 text-lg font-bold ${toneClass}`}>
        {prefix}
        {formatCurrency(Math.abs(value))}
      </p>
    </div>
  );
}
