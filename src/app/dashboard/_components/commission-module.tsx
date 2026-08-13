"use client";

import type { Car, Deal } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";

/**
 * 業務薪資模組：管理員看得到「全部業務」的成交與抽成明細；一般業務只看
 * 得到「自己」承辦的成交車輛與抽成——不會在這裡看到其他業務的薪水資料。
 * can_view_salary 關掉的話整個模組顯示鎖定訊息，什麼資料都不會送到瀏覽器。
 */
export function CommissionModule({
  deals,
  cars,
  staff,
  currentUserId,
  canManageStaff,
  canViewSalary,
}: {
  deals: Deal[];
  cars: Car[];
  staff: { id: string; name: string | null }[];
  currentUserId: string;
  canManageStaff: boolean;
  canViewSalary: boolean;
}) {
  if (!canManageStaff && !canViewSalary) {
    return (
      <section className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-12 text-center text-sm text-neutral-400">
        🔒 此功能尚未開放，請洽車行管理員開啟「檢視個人薪水報表」權限。
      </section>
    );
  }

  const carById = new Map(cars.map((c) => [c.id, c]));
  const staffNameById = new Map(staff.map((s) => [s.id, s.name ?? "未命名"]));

  // 一般業務只看得到自己承辦的合約；管理員看全部——這是「只能看到自己的
  // 成交車輛、自己的預估抽成與薪資明細」這個規則的具體實作，資料在伺服器
  // 端 filter 完才會出現在畫面上（不是前端遮罩，其他業務的合約根本不會
  // render 出來）。
  const visibleDeals = (canManageStaff ? deals : deals.filter((d) => d.salesperson_id === currentUserId))
    .filter((d) => d.status === "signed" || d.status === "delivered")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalCommission = visibleDeals.reduce(
    (sum, d) => sum + Number(d.commission_amount ?? 0),
    0
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-800">
            {canManageStaff ? "業務薪資與抽成總覽" : "我的業績與抽成明細"}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            {canManageStaff
              ? "列出所有已簽約／已交車的合約與各業務的預估抽成"
              : "只會顯示你自己承辦的成交車輛，其他業務的資料不會出現在這裡"}
          </p>
        </div>
        <div className="rounded-xl bg-[#FBF1E4] px-3 py-1.5 text-sm font-semibold text-[#B4813E]">
          累計抽成 {formatCurrency(totalCommission)}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              {canManageStaff && <th className="px-4 py-2 font-medium">承辦業務</th>}
              <th className="px-4 py-2 font-medium">成交車輛</th>
              <th className="px-4 py-2 font-medium">成交價</th>
              <th className="px-4 py-2 font-medium">預估抽成</th>
              <th className="px-4 py-2 font-medium">建立日期</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {visibleDeals.length === 0 && (
              <tr>
                <td colSpan={canManageStaff ? 5 : 4} className="px-4 py-8 text-center text-neutral-400">
                  尚無成交紀錄
                </td>
              </tr>
            )}
            {visibleDeals.map((deal) => {
              const car = carById.get(deal.car_id);
              return (
                <tr key={deal.id} className="hover:bg-neutral-50">
                  {canManageStaff && (
                    <td className="px-4 py-2 text-neutral-800">
                      {deal.salesperson_id
                        ? (staffNameById.get(deal.salesperson_id) ?? "已離職員工")
                        : "未指定業務"}
                    </td>
                  )}
                  <td className="px-4 py-2 text-neutral-800">
                    {car ? `${car.brand ? `${car.brand} ` : ""}${car.model_name}` : "（已刪除車輛）"}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{formatCurrency(deal.final_price)}</td>
                  <td className="px-4 py-2 font-medium text-[#A6793D]">
                    {deal.commission_amount != null ? formatCurrency(deal.commission_amount) : "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">
                    {new Date(deal.created_at).toLocaleDateString("zh-TW")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
