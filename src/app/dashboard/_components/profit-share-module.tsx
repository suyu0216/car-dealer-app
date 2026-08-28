"use client";

// 「淨利／分潤試算」小工具——給有股東/合夥人分潤安排的車行（例如安安
// 自己主店以外另外投資的分店）用，選一個月份，系統直接算出「這個月的
// 淨利」跟「依股權比例算出來的分潤金額」，不用自己另外拿計算機湊資料。
//
// 預設關閉（tenants.profit_share_enabled），不是每間車行都有分潤安排，
// 用不到的車行不會在「會計與財務管理」頁面多出這個分頁造成困擾——只有
// 車行管理員能在這個分頁裡自己打開，見下面 SettingsForm。
//
// 淨利公式（跟 analytics-module.tsx 的「已實現毛利」、payroll-module.tsx
// 的月份歸屬規則保持一致，避免同一個系統對「這筆錢算哪個月」有兩種不同
// 答案）：
//   月毛利 = Σ (車輛成交價 − 車輛結帳總成本)，只算「已結案封存
//            （status='sold' 且 closed_at 有值）且結案月份等於選定月份」
//            的車輛——closed_total_cost 這個結帳快照本身已經包含業務
//            抽成，這裡不能再從 deals 表另外扣一次抽成，否則會重複扣。
//   月營運費用 = Σ 公司開銷金額，類別不是「人事薪資」、支出日期在選定月份
//   月人事底薪 = Σ 公司開銷金額，類別是「人事薪資」、支出日期在選定月份
//   月淨利 = 月毛利 − 月營運費用 − 月人事底薪
//   分潤金額 = 月淨利 × 股權比例 ÷ 100（股權比例還沒填的話，只顯示淨利，
//              分潤金額顯示「請先設定股權比例」）
import { useActionState, useMemo, useState } from "react";
import { updateProfitShareSettings, type ProfitShareSettingsState } from "../tenant-actions";

export type ProfitShareCar = {
  id: string;
  brand: string | null;
  model_name: string;
  status: string;
  /** 車輛實際成交價——跟 deals.final_price 是兩件事，這裡用的是車輛
   * 結帳當下記錄在 cars 表自己的最終售價快照。沒有的話退回 selling_price
   * （掛牌價），兩者都沒有就算 0，見 analytics-module.tsx 的作法。 */
  final_price: number | null;
  selling_price: number | null;
  /** 結帳（售出）封存當下算出的總成本快照（進貨價＋整備費＋過戶費＋
   * 稅金＋業務抽成），只有 status='sold' 才會有值，見 cars-actions.ts
   * 的 computeClosingFields()。 */
  closed_total_cost: number | null;
  /** 結帳封存日期，月份歸屬看這個欄位，不是車輛建立日期。 */
  closed_at: string | null;
};

export type ProfitShareExpense = {
  id: string;
  category: string;
  amount: number;
  expense_date: string;
};

const initialSettingsState: ProfitShareSettingsState = {};

function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export function ProfitShareModule({
  tenant,
  cars,
  expenses,
  isTenantAdmin,
  canViewFinancials,
  onSettingsChanged,
}: {
  tenant: { profit_share_enabled: boolean; profit_share_equity_percent: number | null };
  cars: ProfitShareCar[];
  expenses: ProfitShareExpense[];
  isTenantAdmin: boolean;
  /** 淨利／薪資都是敏感財務資料，這個分頁只給「檢視成本」＋「檢視薪資」
   * 兩個權限都有的人看——車行管理員永遠都有，一般業務要車行管理員在
   * 員工管理另外開這兩個開關才看得到，跟 payroll-module.tsx 的權限邏輯
   * 一致。 */
  canViewFinancials: boolean;
  /** 設定（開關／股權比例）儲存成功後，通知父層重新抓一次 tenant 資料。 */
  onSettingsChanged: () => void;
}) {
  const [month, setMonth] = useState(currentMonthKey());

  const result = useMemo(() => {
    const grossProfit = cars
      .filter((c) => c.status === "sold" && c.closed_at && monthKeyOf(c.closed_at) === month)
      .reduce((sum, c) => {
        const revenue = c.final_price ?? c.selling_price ?? 0;
        const cost = Number(c.closed_total_cost ?? 0);
        return sum + (revenue - cost);
      }, 0);

    const monthExpenses = expenses.filter((e) => monthKeyOf(e.expense_date) === month);
    const opex = monthExpenses
      .filter((e) => e.category !== "人事薪資")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const basePayroll = monthExpenses
      .filter((e) => e.category === "人事薪資")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const netProfit = grossProfit - opex - basePayroll;

    return { grossProfit, opex, basePayroll, netProfit };
  }, [cars, expenses, month]);

  if (!canViewFinancials) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">
        沒有檢視財務資料的權限，請洽車行管理員開通。
      </div>
    );
  }

  if (!tenant.profit_share_enabled) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-sm text-neutral-500">
            這個小工具還沒啟用。啟用後可以選月份，自動算出當月淨利，以及依股權比例算出來的分潤金額——適合有股東／合夥人分潤安排的車行（例如分店）使用，沒有分潤安排的話不用開。
          </p>
          {isTenantAdmin ? (
            <div className="mt-5 text-left">
              <SettingsForm
                enabled={false}
                equityPercent={tenant.profit_share_equity_percent}
                onSettingsChanged={onSettingsChanged}
              />
            </div>
          ) : (
            <p className="mt-3 text-xs text-neutral-400">只有車行管理員能開啟這個功能。</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-xs font-bold text-neutral-600 mb-1">選擇月份</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        {tenant.profit_share_equity_percent != null && (
          <p className="text-xs text-neutral-400">
            目前設定股權比例：<span className="font-semibold text-neutral-600">{tenant.profit_share_equity_percent}%</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="月毛利" value={result.grossProfit} hint="已結案車輛：成交價－結帳總成本（已含抽成）" />
        <SummaryCard label="月營運費用" value={-result.opex} hint="公司開銷，不含人事薪資" />
        <SummaryCard label="月人事底薪" value={-result.basePayroll} hint="公司開銷「人事薪資」類別" />
        <SummaryCard label="月淨利" value={result.netProfit} emphasize />
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-[#FBF1E4] p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-[#A6793D]">試算分潤金額</p>
        {tenant.profit_share_equity_percent == null ? (
          <p className="mt-2 text-sm text-neutral-500">請先設定股權比例才能試算分潤金額。</p>
        ) : (
          <p className="mt-2 text-3xl font-bold tabular-nums text-[#8A5A22]">
            ${Math.round(result.netProfit * (tenant.profit_share_equity_percent / 100)).toLocaleString()}
          </p>
        )}
        <p className="mt-1 text-[11px] text-neutral-400">
          月淨利 × 股權比例（{tenant.profit_share_equity_percent ?? "—"}%）
        </p>
      </div>

      {isTenantAdmin && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-neutral-800 border-b pb-3 mb-4">分潤設定</h3>
          <SettingsForm
            enabled={tenant.profit_share_enabled}
            equityPercent={tenant.profit_share_equity_percent}
            onSettingsChanged={onSettingsChanged}
          />
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: number;
  hint?: string;
  emphasize?: boolean;
}) {
  const positive = value >= 0;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-neutral-500">{label}</p>
      <p
        className={
          "mt-1.5 tabular-nums " +
          (emphasize ? "text-2xl font-bold " : "text-lg font-semibold ") +
          (positive ? "text-neutral-900" : "text-red-600")
        }
      >
        {positive ? "" : "-"}${Math.abs(Math.round(value)).toLocaleString()}
      </p>
      {hint && <p className="mt-1 text-[11px] text-neutral-400">{hint}</p>}
    </div>
  );
}

/** 開關＋股權比例設定表單——用 useActionState 串接 updateProfitShareSettings()，
 * 儲存成功後呼叫 onSettingsChanged() 讓父層重新抓一次 tenant 資料，畫面
 * 才會反映最新的開關狀態／股權比例，不用整頁重新整理。 */
function SettingsForm({
  enabled,
  equityPercent,
  onSettingsChanged,
}: {
  enabled: boolean;
  equityPercent: number | null;
  onSettingsChanged: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prevState: ProfitShareSettingsState | undefined, formData: FormData) => {
      const result = await updateProfitShareSettings(prevState, formData);
      if (result.success) onSettingsChanged();
      return result;
    },
    initialSettingsState
  );

  return (
    <form action={formAction} className="space-y-4">
      <label className="flex items-center gap-2.5 text-sm text-neutral-700">
        <input
          type="checkbox"
          name="profit_share_enabled"
          defaultChecked={enabled}
          className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
        />
        啟用「淨利／分潤試算」
      </label>

      <div>
        <label className="block text-xs font-bold text-neutral-600 mb-1">股權比例（%，選填，可有小數）</label>
        <input
          type="number"
          name="profit_share_equity_percent"
          min="0"
          max="100"
          step="0.01"
          defaultValue={equityPercent ?? ""}
          placeholder="例如：30"
          className="w-full max-w-[160px] rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {pending ? "儲存中…" : "儲存設定"}
      </button>
    </form>
  );
}
