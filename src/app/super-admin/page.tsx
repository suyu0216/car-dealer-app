import Link from "next/link";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/app/_components/logout-button";
import { AppTopBar } from "@/app/_components/app-top-bar";
import { TenantStatusCell } from "./_components/tenant-status-cell";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Car, CompanyExpense, Deal, Tenant } from "@/lib/supabase/types";

const STATUS_LABEL: Record<Car["status"], string> = {
  preparing: "整備中",
  in_stock: "待售中",
  reserved: "已預訂",
  sold: "已售出",
};

interface TenantStat {
  tenant: Tenant;
  carCount: number;
  income: number;
  expense: number;
  net: number;
}

// 「收入」讀「已交車」合約的成交價，「支出」讀公司會計的營運開銷紀錄——
// 這兩張表才是實際在用、有真的資料寫入的來源。舊版這裡讀的是
// `transactions` 這張表，但全站沒有任何地方會寫入它，數字永遠是 0，
// 完全沒反映過任何車行的實際營收，是誤導平台管理員的死資料。

export default async function SuperAdminPage({
  searchParams,
}: PageProps<"/super-admin">) {
  // 驗證登入身份並確認角色為 super_admin；否則導回一般車商後台。
  await requireSuperAdmin();

  // searchParams 的值型別是 string | string[] | undefined（網址上同一個
  // key 出現兩次的話 Next.js 會回傳陣列）——下面好幾個地方拿
  // selectedTenantId 當 Map.get() 的 key 或做 === 比對，都需要單一字串，
  // 這裡先正規化成 string | undefined，只取第一個值，避免型別檢查失敗、
  // 也避免萬一網址真的帶了重複的 tenant 參數時比對邏輯悄悄失效。
  const { tenant: rawSelectedTenantId } = await searchParams;
  const selectedTenantId = Array.isArray(rawSelectedTenantId)
    ? rawSelectedTenantId[0]
    : rawSelectedTenantId;

  // super_admin 的 RLS policy 允許讀取所有租戶的資料，
  // 因此這裡可以一次撈出全部車行、車輛、收支紀錄再彙總。
  const supabase = await createClient();

  const [{ data: tenants }, { data: cars }, { data: deals }, { data: expenses }] =
    await Promise.all([
      supabase
        .from("tenants")
        .select("id, name, phone, address, business_hours, logo_url, line_id, status, onboarding_completed, created_at")
        .order("created_at"),
      supabase
        .from("cars")
        .select(
          "id, tenant_id, brand, model_name, year, mileage, license_plate, color, status, purchase_price, selling_price, floor_price, created_at"
        ),
      supabase
        .from("deals")
        .select("id, tenant_id, car_id, customer_name, final_price, status, created_at"),
      supabase
        .from("company_expenses")
        .select("id, tenant_id, expense_date, category, title, amount"),
    ]);

  const tenantList = (tenants ?? []) as Tenant[];
  const carList = (cars ?? []) as Car[];
  const dealList = (deals ?? []) as Pick<
    Deal,
    "id" | "tenant_id" | "car_id" | "customer_name" | "final_price" | "status" | "created_at"
  >[];
  const expenseList = (expenses ?? []) as Pick<
    CompanyExpense,
    "id" | "tenant_id" | "expense_date" | "category" | "title" | "amount"
  >[];

  // 收入只算「已交車」的合約——draft/signed 都還沒真的成交，算進去會
  // 高估還沒到手的營收。
  const deliveredDealsByTenant = new Map<string, typeof dealList>();
  for (const deal of dealList) {
    if (deal.status !== "delivered") continue;
    const list = deliveredDealsByTenant.get(deal.tenant_id) ?? [];
    list.push(deal);
    deliveredDealsByTenant.set(deal.tenant_id, list);
  }

  const stats: TenantStat[] = tenantList.map((tenant) => {
    const tenantCars = carList.filter((c) => c.tenant_id === tenant.id);
    const tenantDeliveredDeals = deliveredDealsByTenant.get(tenant.id) ?? [];
    const tenantExpenses = expenseList.filter((e) => e.tenant_id === tenant.id);
    const income = tenantDeliveredDeals.reduce((sum, d) => sum + Number(d.final_price), 0);
    const expense = tenantExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      tenant,
      carCount: tenantCars.length,
      income,
      expense,
      net: income - expense,
    };
  });

  const totalIncome = stats.reduce((sum, s) => sum + s.income, 0);
  const totalExpense = stats.reduce((sum, s) => sum + s.expense, 0);
  const totalNet = totalIncome - totalExpense;
  const totalCars = carList.length;
  const pendingCount = tenantList.filter((t) => t.status === "pending").length;

  const selectedStat = selectedTenantId
    ? stats.find((s) => s.tenant.id === selectedTenantId)
    : undefined;

  const detailCars = selectedTenantId
    ? carList.filter((c) => c.tenant_id === selectedTenantId)
    : [];
  const detailDeliveredDeals = selectedTenantId
    ? (deliveredDealsByTenant.get(selectedTenantId) ?? [])
    : [];
  const detailExpenses = selectedTenantId
    ? expenseList.filter((e) => e.tenant_id === selectedTenantId)
    : [];

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <AppTopBar />
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            平台管理員主控台
          </h1>
          <p className="text-sm text-neutral-500">全車行總覽與營收統計</p>
        </div>
        <LogoutButton />
      </header>

      {/* 全平台總覽 */}
      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="車行數" value={`${tenantList.length} 家`} />
        <StatCard
          label="待審核車商"
          value={`${pendingCount} 家`}
          tone={pendingCount > 0 ? "warning" : undefined}
        />
        <StatCard label="總車輛數" value={`${totalCars} 輛`} />
        <StatCard label="總收入" value={formatCurrency(totalIncome)} />
        <StatCard
          label="總淨利"
          value={formatCurrency(totalNet)}
          tone={totalNet >= 0 ? "positive" : "negative"}
        />
      </section>

      {/* 各車行統計表 + 切換連結 */}
      <section className="mt-10">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          各車行營收統計
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2 font-medium">車行</th>
                <th className="px-4 py-2 font-medium">狀態</th>
                <th className="px-4 py-2 font-medium">車輛數</th>
                <th className="px-4 py-2 font-medium">收入</th>
                <th className="px-4 py-2 font-medium">支出</th>
                <th className="px-4 py-2 font-medium">淨利</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {stats.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                    尚無車行資料
                  </td>
                </tr>
              )}
              {stats.map((s) => (
                <tr
                  key={s.tenant.id}
                  className={
                    s.tenant.id === selectedTenantId
                      ? "bg-neutral-50 dark:bg-neutral-900"
                      : undefined
                  }
                >
                  <td className="px-4 py-2 font-medium">{s.tenant.name}</td>
                  <td className="px-4 py-2">
                    <TenantStatusCell tenantId={s.tenant.id} status={s.tenant.status} />
                  </td>
                  <td className="px-4 py-2">{s.carCount} 輛</td>
                  <td className="px-4 py-2">{formatCurrency(s.income)}</td>
                  <td className="px-4 py-2">{formatCurrency(s.expense)}</td>
                  <td
                    className={
                      "px-4 py-2 " +
                      (s.net >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400")
                    }
                  >
                    {formatCurrency(s.net)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/super-admin?tenant=${s.tenant.id}`}
                      className="text-neutral-500 underline-offset-2 hover:underline"
                    >
                      查看明細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 選定車行的明細 */}
      {selectedStat && (
        <section className="mt-10 pb-10">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {selectedStat.tenant.name} — 車輛與收支明細
            </h2>
            <Link
              href="/super-admin"
              className="text-sm text-neutral-500 underline-offset-2 hover:underline"
            >
              返回總覽
            </Link>
          </div>

          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">廠牌</th>
                  <th className="px-4 py-2 font-medium">車型</th>
                  <th className="px-4 py-2 font-medium">年份</th>
                  <th className="px-4 py-2 font-medium">里程</th>
                  <th className="px-4 py-2 font-medium">狀態</th>
                  <th className="px-4 py-2 font-medium">進價</th>
                  <th className="px-4 py-2 font-medium">售價</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {detailCars.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                      尚無車輛資料
                    </td>
                  </tr>
                )}
                {detailCars.map((car) => (
                  <tr key={car.id}>
                    <td className="px-4 py-2">{car.brand ?? "—"}</td>
                    <td className="px-4 py-2">{car.model_name}</td>
                    <td className="px-4 py-2">{car.year ?? "—"}</td>
                    <td className="px-4 py-2">
                      {car.mileage != null ? `${car.mileage.toLocaleString("zh-TW")} km` : "—"}
                    </td>
                    <td className="px-4 py-2">{STATUS_LABEL[car.status]}</td>
                    <td className="px-4 py-2">{formatCurrency(car.purchase_price)}</td>
                    <td className="px-4 py-2">
                      {car.selling_price != null ? formatCurrency(car.selling_price) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                收入 — 已交車合約
              </h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900">
                    <tr>
                      <th className="px-4 py-2 font-medium">日期</th>
                      <th className="px-4 py-2 font-medium">客戶</th>
                      <th className="px-4 py-2 font-medium">成交價</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {detailDeliveredDeals.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                          尚無已交車的合約
                        </td>
                      </tr>
                    )}
                    {detailDeliveredDeals.map((deal) => (
                      <tr key={deal.id}>
                        <td className="px-4 py-2 text-neutral-500">
                          {formatDate(deal.created_at)}
                        </td>
                        <td className="px-4 py-2">{deal.customer_name}</td>
                        <td className="px-4 py-2">{formatCurrency(deal.final_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                支出 — 公司會計記帳
              </h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900">
                    <tr>
                      <th className="px-4 py-2 font-medium">日期</th>
                      <th className="px-4 py-2 font-medium">項目</th>
                      <th className="px-4 py-2 font-medium">金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {detailExpenses.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                          尚無支出紀錄
                        </td>
                      </tr>
                    )}
                    {detailExpenses.map((expense) => (
                      <tr key={expense.id}>
                        <td className="px-4 py-2 text-neutral-500">
                          {formatDate(expense.expense_date)}
                        </td>
                        <td className="px-4 py-2">
                          {expense.title}
                          <span className="ml-1.5 text-xs text-neutral-400">
                            {expense.category}
                          </span>
                        </td>
                        <td className="px-4 py-2">{formatCurrency(expense.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "warning";
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={
          "mt-1 text-lg font-semibold " +
          (tone === "positive"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "negative"
              ? "text-red-600 dark:text-red-400"
              : tone === "warning"
                ? "text-[#A6793D] dark:text-[#D3A35E]"
                : "text-neutral-900 dark:text-neutral-100")
        }
      >
        {value}
      </p>
    </div>
  );
}
