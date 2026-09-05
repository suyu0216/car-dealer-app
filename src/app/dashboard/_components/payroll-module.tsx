"use client";

// 「薪資單」——選員工、選月份，看這個人這個月的底薪＋這個月所有已交車
// 合約的抽成加總＝應付總額。資料來源：
//   - 底薪／獎金：company_expenses 裡 category === "人事薪資" 且
//     employee_profile_id 等於選定員工的紀錄（見 accounting/page.tsx
//     新增開銷表單的「發給員工」欄位），算哪個月看安安填的 expense_date。
//     薪資會計、剪輯師這類非業務的員工，都是走這條路徑記帳。
//   - 抽成：deals 裡 salesperson_id 等於選定員工、status === "delivered"
//     （已交車＝這筆合約的抽成才算真的要撥款）的合約，加總
//     commission_amount。算哪個月看這筆合約對應那輛車的 cars.closed_at
//     （結帳封存日）——安安要求「當月結案、當月發」，車輛狀態轉 sold
//     觸發結帳封存時 closed_at 才會有值（見 cars-actions.ts 的
//     computeClosingFields）。萬一車子還沒真正結帳封存但合約已經是
//     delivered（例如資料還沒同步過來），closed_at 會是 null，這種
//     情況退回用 deals.created_at 當月份，避免這筆抽成憑空消失、算不到
//     任何月份。
import { useState } from "react";
import { formatCurrency, formatDate, formatNumber, currentTaiwanMonthKey, taiwanMonthKey } from "@/lib/format";

type StaffOption = { id: string; name: string | null };

type PayrollDeal = {
  id: string;
  car_id: string;
  customer_name: string;
  status: "draft" | "signed" | "delivered";
  salesperson_id: string | null;
  commission_amount: number | null;
  created_at: string;
};

type PayrollCar = { id: string; brand: string | null; model_name: string; closed_at: string | null };

type PayrollExpense = {
  id: string;
  expense_date: string;
  category: string;
  title: string;
  amount: number;
  employee_profile_id: string | null;
  note: string | null;
};

export function PayrollModule({
  staff,
  deals,
  cars,
  expenses,
  canManageStaff,
  canViewSalary,
  currentUserId,
}: {
  staff: StaffOption[];
  deals: PayrollDeal[];
  cars: PayrollCar[];
  expenses: PayrollExpense[];
  canManageStaff: boolean;
  canViewSalary: boolean;
  currentUserId: string | null;
}) {
  const defaultMonth = currentTaiwanMonthKey();
  const [month, setMonth] = useState(defaultMonth);
  // 管理員可以挑任何員工；一般業務只能看自己的，一律鎖定 currentUserId，
  // 不給下拉選單挑別人——跟業務薪資模組（commission-module.tsx）同一套
  // 「只能看到自己的薪資明細」規則。
  const [selectedId, setSelectedId] = useState(canManageStaff ? "" : (currentUserId ?? ""));

  if (!canManageStaff && !canViewSalary) {
    return (
      <section className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-12 text-center text-sm text-neutral-400">
        🔒 此功能尚未開放，請洽車行管理員開啟「檢視個人薪水報表」權限。
      </section>
    );
  }

  const carById = new Map(cars.map((c) => [c.id, c]));
  const staffNameById = new Map(staff.map((s) => [s.id, s.name ?? "未命名"]));
  const staffOptions = canManageStaff ? staff : staff.filter((s) => s.id === currentUserId);

  const salaryItems = selectedId
    ? expenses.filter(
        (e) => e.category === "人事薪資" && e.employee_profile_id === selectedId && taiwanMonthKey(e.expense_date) === month
      )
    : [];
  // 這筆抽成算哪個月：優先用車輛的結帳封存日（closed_at）——安安要的是
  // 「當月結案、當月發」；車子還沒結帳封存（closed_at 是 null，理論上
  // 不太會發生在 delivered 合約上）才退回用合約建立日期，避免漏掉。
  const dealMonthKey = (d: PayrollDeal) => {
    const closedAt = carById.get(d.car_id)?.closed_at;
    return taiwanMonthKey(closedAt ?? d.created_at);
  };
  const commissionDeals = selectedId
    ? deals.filter((d) => d.salesperson_id === selectedId && d.status === "delivered" && dealMonthKey(d) === month)
    : [];

  const salaryTotal = salaryItems.reduce((sum, e) => sum + Number(e.amount), 0);
  const commissionTotal = commissionDeals.reduce((sum, d) => sum + Number(d.commission_amount ?? 0), 0);
  const grandTotal = salaryTotal + commissionTotal;

  // 2026-08-29 新增：「薪水成長趨勢」——安安希望業務三不五時打開網頁能
  // 看到自己的薪水有成長，原本這個分頁一次只看單一月份的數字，看不出
  // 「有沒有變好」。這裡用同一套底薪/抽成計算方式，額外算出「目前選定
  // 月份」往前推 6 個月（含當月）的每月應付總額，畫成一排長條圖，
  // 底薪/抽成的月份歸屬規則跟上面單月明細完全一致，不會有兩套不同答案。
  function monthKeysEndingAt(endMonthKey: string, count: number): string[] {
    const [y, m] = endMonthKey.split("-").map(Number);
    const keys: string[] = [];
    for (let i = count - 1; i >= 0; i -= 1) {
      const d = new Date(y, m - 1 - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return keys;
  }
  // 2026-08-31 新增：安安要看「已成交的車子當月總共」，分月看——薪水是
  // 按月結算的，只看錢的總額不夠，還要知道這個月／每個月到底成交了幾台
  // 車，才知道這個月的抽成是靠幾筆案子湊出來的。台數用跟抽成金額同一套
  // 月份歸屬規則（dealMonthKey：優先看車輛結帳封存日），確保「這個月有
  // 幾台車」跟「這個月抽成多少錢」永遠是同一批合約算出來的，不會兜不
  // 起來。
  //
  // 2026-08-31 再次調整：拆成不吃 selectedId、直接吃任一 staffId 的純
  // 函式（computeStaffMonth），下面「全部員工薪資總覽」表格要一次算出
  // 每個人的月結果，不能只算選定的那一位；原本的 totalsForMonth（薪水
  // 趨勢長條圖用）跟這裡改成共用同一套算法，避免兩邊公式各寫一次、之後
  // 改規則忘記同步。
  function computeStaffMonth(staffId: string, monthKey: string) {
    const salary = expenses
      .filter(
        (e) => e.category === "人事薪資" && e.employee_profile_id === staffId && taiwanMonthKey(e.expense_date) === monthKey
      )
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const monthDeals = deals.filter(
      (d) => d.salesperson_id === staffId && d.status === "delivered" && dealMonthKey(d) === monthKey
    );
    const commission = monthDeals.reduce((sum, d) => sum + Number(d.commission_amount ?? 0), 0);
    return { salary, commission, total: salary + commission, carCount: monthDeals.length };
  }
  function totalsForMonth(monthKey: string) {
    if (!selectedId) return { total: 0, carCount: 0 };
    return computeStaffMonth(selectedId, monthKey);
  }
  // 2026-08-31 新增：「全部員工薪資總覽」——安安反映會計/老闆應該打開
  // 「薪資單」分頁就直接看到所有員工這個月的薪資，不用一個一個從下拉
  // 選單挑出來看。只有 canManageStaff（這裡其實是 canManageStaff 或
  // canViewAllSalary，見 accounting/page.tsx 怎麼傳這個 prop）才看得到
  // 這張總覽表；一般業務/員工只能看自己的，不需要、也不該看到別人的
  // 總覽。表格依應付總額由高到低排序，點一列會帶入 selectedId，下面自動
  // 展開那個人完整的底薪/抽成明細（沿用原本就有的單人明細畫面，不用
  // 重複做一份）。
  const allStaffSummary = canManageStaff
    ? staffOptions
        .map((s) => ({ id: s.id, name: s.name ?? "未命名", ...computeStaffMonth(s.id, month) }))
        .sort((a, b) => b.total - a.total)
    : [];
  const trendMonths = monthKeysEndingAt(month, 6);
  const trendTotals = trendMonths.map((mk) => {
    const { total, carCount } = totalsForMonth(mk);
    return { month: mk, total, carCount };
  });
  const trendMax = Math.max(1, ...trendTotals.map((t) => t.total));
  // 跟上個月比較的成長率——只有上個月「有領到錢」時才顯示百分比，避免
  // 上個月是 0 時算出無意義的「成長 N 萬 %」。
  const prevMonthTotal = trendTotals.length >= 2 ? trendTotals[trendTotals.length - 2].total : 0;
  const growthPct = prevMonthTotal > 0 ? Math.round(((grandTotal - prevMonthTotal) / prevMonthTotal) * 100) : null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-800">🧾 薪資單</h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            底薪／獎金抓「公司開銷」裡指定發給這位員工的「人事薪資」紀錄；抽成抓這個月結帳封存（售出）的已交車合約，當月結案、當月算進薪資單。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageStaff && (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-800 outline-none focus:border-[#BFA074]"
            >
              <option value="">請選擇員工</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? "未命名"}
                </option>
              ))}
            </select>
          )}
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-800 outline-none focus:border-[#BFA074]"
          />
        </div>
      </div>

      {/* 2026-08-31 新增：全部員工薪資總覽，只有 canManageStaff 看得到。
          放在上面單人下拉選單/明細的前面——會計/老闆打開這個分頁不用
          先選人，直接看到這個月每個人領多少，點一列才需要下拉細節。 */}
      {canManageStaff && (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-neutral-700">👥 全部員工薪資總覽・{month}</h3>
            <p className="text-xs text-neutral-400">點一列可以展開該員工完整明細</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs text-neutral-400">
                <th className="px-4 py-2 font-medium">員工</th>
                <th className="px-4 py-2 text-right font-medium">底薪／獎金</th>
                <th className="px-4 py-2 text-right font-medium">抽成</th>
                <th className="px-4 py-2 text-right font-medium">本月成交</th>
                <th className="px-4 py-2 text-right font-medium">應付總額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {allStaffSummary.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    目前車行還沒有員工資料
                  </td>
                </tr>
              )}
              {allStaffSummary.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={
                    "cursor-pointer transition hover:bg-neutral-50 " +
                    (s.id === selectedId ? "bg-[#FBF1E4]/60" : "")
                  }
                >
                  <td className="px-4 py-2 text-neutral-800">{s.name}</td>
                  <td className="px-4 py-2 text-right text-neutral-600">{formatCurrency(s.salary)}</td>
                  <td className="px-4 py-2 text-right text-neutral-600">{formatCurrency(s.commission)}</td>
                  <td className="px-4 py-2 text-right text-neutral-500">{s.carCount} 台</td>
                  <td className="px-4 py-2 text-right font-semibold text-[#A6793D]">{formatCurrency(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!selectedId ? (
        canManageStaff ? null : (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-12 text-center text-sm text-neutral-400">
            找不到您的員工資料
          </div>
        )
      ) : (
        <>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-neutral-500">
              {staffNameById.get(selectedId) ?? "未命名"}・{month} 應付總額
            </p>
            <p className="mt-1 text-3xl font-bold text-[#A6793D]">{formatCurrency(grandTotal)}</p>
            <p className="mt-1 text-xs text-neutral-400">
              底薪／獎金 {formatCurrency(salaryTotal)} ＋ 抽成 {formatCurrency(commissionTotal)}
            </p>
            {/* 2026-08-31 新增：薪水是按月結算，安安要看這個月抽成是靠幾台
                成交車湊出來的，不只是看錢的總額。台數就是下面「抽成明細
                （已交車）」表格的列數，同一份 commissionDeals 陣列。 */}
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#FBF1E4] px-2.5 py-1 text-xs font-semibold text-[#A6793D]">
              🚗 本月已成交 {commissionDeals.length} 台
            </p>
            {growthPct !== null && (
              <p
                className={
                  "mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold " +
                  (growthPct >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600")
                }
              >
                {growthPct >= 0 ? "📈" : "📉"} 較上月 {growthPct >= 0 ? "+" : ""}
                {growthPct}%
              </p>
            )}
          </div>

          {/* 薪水成長趨勢：近 6 個月（含當前選定月份）應付總額長條圖，讓
              業務／老闆一眼看出是不是月月在進步，不用自己每個月切換月份
              手動比對。 */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-800">📈 近 6 個月薪水趨勢</h3>
            <p className="mt-0.5 text-xs text-neutral-400">底薪／獎金＋抽成，依月份加總；括號內是當月已成交台數</p>
            <div className="mt-4 flex items-end gap-2 sm:gap-3">
              {trendTotals.map(({ month: mk, total, carCount }) => {
                const [, mNum] = mk.split("-");
                const isCurrent = mk === month;
                return (
                  <div key={mk} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] tabular-nums text-neutral-400">
                      {total > 0 ? formatNumber(Math.round(total / 1000)) + "k" : ""}
                    </span>
                    <div
                      className={"w-full rounded-t-md " + (isCurrent ? "bg-[#BFA074]" : "bg-[#E7DAC3]")}
                      style={{ height: `${Math.max(4, (total / trendMax) * 96)}px` }}
                    />
                    <span className="text-[10px] text-neutral-400">
                      {Number(mNum)}月{carCount > 0 ? `（${carCount}台）` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-700">
                底薪／獎金明細
              </div>
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {salaryItems.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-neutral-400">這個月沒有記錄</td>
                    </tr>
                  )}
                  {salaryItems.map((e) => (
                    <tr key={e.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-2 text-xs text-neutral-500">{formatDate(e.expense_date)}</td>
                      <td className="px-4 py-2 text-neutral-800">
                        {e.title}
                        {e.note && <span className="block text-xs font-normal text-neutral-400">{e.note}</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-neutral-800">
                        {formatCurrency(Number(e.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-700">
                抽成明細（已交車）
              </div>
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {commissionDeals.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-neutral-400">這個月沒有已交車的成交案件</td>
                    </tr>
                  )}
                  {commissionDeals.map((d) => {
                    const car = carById.get(d.car_id);
                    return (
                      <tr key={d.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-2 text-xs text-neutral-500">{formatDate(car?.closed_at ?? d.created_at)}</td>
                        <td className="px-4 py-2 text-neutral-800">
                          {car ? `${car.brand ? `${car.brand} ` : ""}${car.model_name}` : "（已刪除車輛）"}
                          <span className="block text-xs font-normal text-neutral-400">{d.customer_name}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-[#A6793D]">
                          {d.commission_amount != null ? formatCurrency(Number(d.commission_amount)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
