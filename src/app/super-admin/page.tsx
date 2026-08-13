import Link from "next/link";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/app/_components/logout-button";
import { AppTopBar } from "@/app/_components/app-top-bar";
import { TenantStatusCell } from "./_components/tenant-status-cell";
import { formatCurrency } from "@/lib/format";
import type { Car, Tenant, Transaction } from "@/lib/supabase/types";

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

export default async function SuperAdminPage({
  searchParams,
}: PageProps<"/super-admin">) {
  // 驗證登入身份並確認角色為 super_admin；否則導回一般車商後台。
  await requireSuperAdmin();

  const { tenant: selectedTenantId } = await searchParams;

  // super_admin 的 RLS policy 允許讀取所有租戶的資料，
  // 因此這裡可以一次撈出全部車行、車輛、收支紀錄再彙總。
  const supabase = await createClient();

  const [{ data: tenants }, { data: cars }, { data: transactions }] =
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
        .from("transactions")
        .select("id, tenant_id, car_id, date, type, category, amount, note"),
    ]);

  const tenantList = (tenants ?? []) as Tenant[];
  const carList = (cars ?? []) as Car[];
  const txList = (transactions ?? []) as Transaction[];

  const stats: TenantStat[] = tenantList.map((tenant) => {
    const tenantCars = carList.filter((c) => c.tenant_id === tenant.id);
    const tenantTx = txList.filter((t) => t.tenant_id === tenant.id);
    const income = tenantTx
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = tenantTx
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0);

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
  const detailTx = selectedTenantId
    ? txList.filter((t) => t.tenant_id === selectedTenantId)
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

          <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">日期</th>
                  <th className="px-4 py-2 font-medium">類型</th>
                  <th className="px-4 py-2 font-medium">類別</th>
                  <th className="px-4 py-2 font-medium">金額</th>
                  <th className="px-4 py-2 font-medium">備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {detailTx.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                      尚無收支紀錄
                    </td>
                  </tr>
                )}
                {detailTx.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-2 text-neutral-500">
                      {new Date(tx.date).toLocaleDateString("zh-TW")}
                    </td>
                    <td className="px-4 py-2">
                      {tx.type === "income" ? "收入" : "支出"}
                    </td>
                    <td className="px-4 py-2">{tx.category}</td>
                    <td className="px-4 py-2">{formatCurrency(tx.amount)}</td>
                    <td className="px-4 py-2 text-neutral-500">{tx.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
