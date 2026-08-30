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
  canEditCars,
  repairCost,
  onView,
  onEdit,
}: {
  car: Car;
  canViewCost: boolean;
  canEditCars: boolean;
  /** 這輛車已核准撥款的整備維修費用加總，見 cars-manager.tsx 的
   * computeApprovedPrepCostByCar()。 */
  repairCost: number;
  onView: (car: Car) => void;
  onEdit: (car: Car) => void;
}) {
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
            <p className="text-xs text-neutral-400">開價</p>
            <p className="text-lg font-semibold text-[#A6793D] tabular-nums sm:text-xl">
              {car.selling_price != null ? formatCurrency(car.selling_price) : "洽詢"}
            </p>
            {car.floor_price != null && (
              <p className="text-xs text-neutral-400">
                底價 {canViewCost ? formatCurrency(car.floor_price) : "🔒 權限不足"}
              </p>
            )}
            {repairCost > 0 && (
              <p className="text-xs text-neutral-400">
                整備費 {canViewCost ? formatCurrency(repairCost) : "🔒 權限不足"}
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
