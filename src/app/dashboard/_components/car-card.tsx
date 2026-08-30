"use client";

import type { Car } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";
import { CarStatusBadge } from "./car-status-badge";
import { CarAgingBadge } from "./car-aging-badge";
import { CarTitleBadge } from "./car-title-badge";
import { CarQuickActions } from "./car-quick-actions";

export function CarCard({
  car,
  canViewCost,
  canViewCommission,
  canEditCars,
  repairCost,
  showCost,
  onView,
  onEdit,
}: {
  car: Car;
  canViewCost: boolean;
  /** 2026-08-30 新增：這輛車已結帳封存的「業務抽成」（closed_commission_cost）
   * 是某位業務同仁的薪資資訊，不能只靠 canViewCost 就看得到——預設會
   * 看得到成本的店長、或被個別開放 canViewCost 的一般員工，都不該因此
   * 連帶看到別人的抽成金額。只有「看得到全體薪資」（canViewAllSalary）
   * 或「會計/財務管理」（canManageFinance）才會是 true，見 cars-manager.tsx
   * 怎麼算這個值。 */
  canViewCommission: boolean;
  canEditCars: boolean;
  /** 這輛車已核准撥款的整備維修費用加總，見 cars-manager.tsx 的
   * computeApprovedPrepCostByCar()。 */
  repairCost: number;
  /** 2026-08-30 新增：卡片上「成本＋開銷」那一行要不要顯示——安安希望
   * 大圖卡片能一眼看到這台車目前的成本+開銷，但也想要能自己開關，不想
   * 看的時候可以收起來。這是單純的顯示偏好（存在瀏覽器 localStorage，
   * 見 cars-manager.tsx），不是權限——沒有 canViewCost 的人不管這個開關
   * 打開或關閉，一律看不到金額，兩者是分開的兩件事。 */
  showCost: boolean;
  onView: (car: Car) => void;
  onEdit: (car: Car) => void;
}) {
  // 2026-08-30：安安反映「成本＋開銷」合在一起看不出來開銷實際花多少，
  // 希望拆成「成本」（收購進價，進貨要花的錢）跟「開銷」（其他所有支出）
  // 分開顯示，再顯示一次總和。
  //
  // 同一天安安又反映：已結帳車輛的「開銷」裡面藏著業務抽成，抽成是
  // 薪資隱私，不該讓看得到成本、但看不到全體薪資的人（例如預設的店長）
  // 從這裡看到、甚至反推出某個業務同仁抽成多少——所以再拆一層：
  //   成本 purchaseCost = 收購進價（car.purchase_price）
  //   抽成 commissionCost = 已結帳車輛的 closed_commission_cost，未結帳
  //          車輛一律是 0（deal 還沒交車結案，也就還沒有抽成快照）
  //   開銷 operatingCost = 純粹的整備＋規費＋稅金，不含抽成——未結帳即時
  //          算 repairCost＋transfer_fee＋tax_amount；已結帳則用
  //          closed_total_cost 反推：closed_total_cost 本身 = 成本＋開銷
  //          ＋抽成，所以 開銷 = closed_total_cost − 成本 − 抽成
  //   顯示的合計 visibleTotal = 成本 ＋ 開銷 ＋（有權限才加）抽成——沒有
  //          canViewCommission 的人，合計就完全不含抽成，不會露出任何
  //          能讓人用「合計－已知項目」反推出抽成的線索。
  const purchaseCost = Number(car.purchase_price);
  const commissionCost = car.closed_at != null ? Number(car.closed_commission_cost ?? 0) : 0;
  const operatingCost =
    car.closed_at != null
      ? Number(car.closed_total_cost ?? 0) - purchaseCost - commissionCost
      : repairCost + Number(car.transfer_fee ?? 0) + Number(car.tax_amount ?? 0);
  const showCommission = canViewCommission && commissionCost > 0;
  const visibleTotal = purchaseCost + operatingCost + (showCommission ? commissionCost : 0);
  const totalLabel = showCommission ? "成本＋開銷＋抽成合計" : "成本＋開銷合計";
  return (
    // 2026-08-30：「藝廊卡片」改成大圖卡片——圖片區域從 16/10 拉高到
    // 4/3，讓照片占卡片的比例明顯變大；標題、價格字級也一併放大，
    // 整張卡片的視覺重心從「資訊」移到「車輛照片」，搭配 car-gallery.tsx
    // 把一排卡片數從 4 張收斂成最多 3 張，兩邊要一起看：卡片變寬＋圖片
    // 區域比例變高，照片才會真的看起來變大，不是只有其中一邊改。
    <div
      onClick={() => onView(car)}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-100">
        {car.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 車輛主圖來源是使用者貼的任意外部網址，走 next/image 需要額外設定允許的 domain 白名單，這裡先用原生 <img>。
          <img
            src={car.image_url}
            alt={`${car.brand ?? ""} ${car.model_name}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl text-neutral-300">
            🚗
          </div>
        )}
        <div className="absolute left-2.5 top-2.5">
          <CarStatusBadge status={car.status} className="bg-white/90 backdrop-blur" />
        </div>
        {car.brand && (
          <div className="absolute right-2.5 top-2.5 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#A6793D] backdrop-blur">
            {car.brand}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5">
        <h3 className="truncate text-base font-semibold text-neutral-800 sm:text-lg">{car.model_name}</h3>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {car.is_featured && <MiniBadge>⭐ 熱門推薦</MiniBadge>}
          {car.is_large_card && <MiniBadge>🖼️ 大圖卡</MiniBadge>}
          {car.body_type && <MiniBadge>{car.body_type}</MiniBadge>}
          {car.year && <MiniBadge>{car.year} 年式</MiniBadge>}
          {car.mileage != null && <MiniBadge>{car.mileage.toLocaleString("zh-TW")} km</MiniBadge>}
          {car.color && <MiniBadge>{car.color}</MiniBadge>}
          <CarAgingBadge car={car} />
          <CarTitleBadge car={car} canViewCost={canViewCost} />
        </div>

        <div className="mt-3.5 flex items-end justify-between">
          <div>
            {canViewCost && showCost && (
              <div className="mb-1.5 space-y-0.5 rounded-lg bg-neutral-50 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
                  <span>成本（收購進價）</span>
                  <span className="font-medium tabular-nums text-neutral-700">
                    {formatCurrency(purchaseCost)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
                  <span>開銷（整備＋規費＋稅金）</span>
                  <span className="font-medium tabular-nums text-neutral-700">
                    {formatCurrency(operatingCost)}
                  </span>
                </div>
                {showCommission && (
                  <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
                    <span>業務抽成</span>
                    <span className="font-medium tabular-nums text-neutral-700">
                      {formatCurrency(commissionCost)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-1 text-xs font-semibold text-neutral-800">
                  <span>{totalLabel}</span>
                  <span className="tabular-nums text-[#A6793D]">{formatCurrency(visibleTotal)}</span>
                </div>
              </div>
            )}
            <p className="text-xs text-neutral-400">開價</p>
            <p className="text-lg font-semibold text-[#A6793D] tabular-nums sm:text-xl">
              {car.selling_price != null ? formatCurrency(car.selling_price) : "洽詢"}
            </p>
            {car.floor_price != null && (
              <p className="text-xs text-neutral-400">
                底價 {canViewCost ? formatCurrency(car.floor_price) : "🔒 權限不足"}
              </p>
            )}
          </div>
          {canEditCars && (
            <div className="flex flex-wrap justify-end gap-1.5">
              <CarQuickActions car={car} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(car);
                }}
                className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition hover:border-[#BFA074] hover:text-[#A6793D]"
              >
                編輯
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-500">
      {children}
    </span>
  );
}
