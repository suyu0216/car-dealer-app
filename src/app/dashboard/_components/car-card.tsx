"use client";

import type { Car } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";
import { CarStatusBadge } from "./car-status-badge";
import { CarAgingBadge } from "./car-aging-badge";
import { CarQuickActions } from "./car-quick-actions";

export function CarCard({
  car,
  canViewCost,
  canEditCars,
  onView,
  onEdit,
}: {
  car: Car;
  canViewCost: boolean;
  canEditCars: boolean;
  onView: (car: Car) => void;
  onEdit: (car: Car) => void;
}) {
  return (
    <div
      onClick={() => onView(car)}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-neutral-100">
        {car.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 車輛主圖來源是使用者貼的任意外部網址，走 next/image 需要額外設定允許的 domain 白名單，這裡先用原生 <img>。
          <img
            src={car.image_url}
            alt={`${car.brand ?? ""} ${car.model_name}`}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-neutral-300">
            🚗
          </div>
        )}
        <div className="absolute left-2 top-2">
          <CarStatusBadge status={car.status} className="bg-white/90 backdrop-blur" />
        </div>
        {car.brand && (
          <div className="absolute right-2 top-2 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-[#A6793D] backdrop-blur">
            {car.brand}
          </div>
        )}
      </div>

      <div className="p-3.5">
        <h3 className="truncate text-sm font-semibold text-neutral-800">{car.model_name}</h3>

        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {car.year && <MiniBadge>{car.year} 年式</MiniBadge>}
          {car.mileage != null && <MiniBadge>{car.mileage.toLocaleString("zh-TW")} km</MiniBadge>}
          {car.color && <MiniBadge>{car.color}</MiniBadge>}
          <CarAgingBadge car={car} />
        </div>

        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-[11px] text-neutral-400">開價</p>
            <p className="text-base font-semibold text-[#A6793D] tabular-nums">
              {car.selling_price != null ? formatCurrency(car.selling_price) : "洽詢"}
            </p>
            {car.floor_price != null && (
              <p className="text-[11px] text-neutral-400">
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
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">
      {children}
    </span>
  );
}
