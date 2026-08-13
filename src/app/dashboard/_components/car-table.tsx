"use client";

import type { Car } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";
import { CarStatusBadge } from "./car-status-badge";
import { CarAgingBadge } from "./car-aging-badge";
import { CarQuickActions } from "./car-quick-actions";

export function CarTable({
  cars,
  canViewCost,
  canEditCars,
  onView,
  onEdit,
}: {
  cars: Car[];
  /** 收購進價/底價屬於敏感成本資訊，沒有這個權限的人看到遮罩。 */
  canViewCost: boolean;
  /** 沒有這個權限就不顯示「編輯」按鈕（可以看、不能改）。 */
  canEditCars: boolean;
  onView: (car: Car) => void;
  onEdit: (car: Car) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-500">
          <tr>
            <th className="px-4 py-2 font-medium">廠牌/車型</th>
            <th className="px-4 py-2 font-medium">年份</th>
            <th className="px-4 py-2 font-medium">里程數 (km)</th>
            <th className="px-4 py-2 font-medium">車牌號碼</th>
            <th className="px-4 py-2 font-medium">車輛狀態</th>
            <th className="px-4 py-2 font-medium">收購進價</th>
            <th className="px-4 py-2 font-medium">開價/底價</th>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {cars.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                沒有符合篩選條件的車輛
              </td>
            </tr>
          )}
          {cars.map((car) => (
            <tr
              key={car.id}
              className="cursor-pointer transition hover:bg-neutral-50"
              onClick={() => onView(car)}
            >
              <td className="px-4 py-2 text-neutral-800">
                {car.brand ? `${car.brand} ` : ""}
                {car.model_name}
              </td>
              <td className="px-4 py-2 text-neutral-600">{car.year ?? "—"}</td>
              <td className="px-4 py-2 text-neutral-600">
                {car.mileage != null ? `${car.mileage.toLocaleString("zh-TW")} km` : "—"}
              </td>
              <td className="px-4 py-2 text-neutral-600">{car.license_plate ?? "—"}</td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <CarStatusBadge status={car.status} />
                  <CarAgingBadge car={car} />
                </div>
              </td>
              <td className="px-4 py-2 text-neutral-600">
                {canViewCost ? formatCurrency(car.purchase_price) : "🔒"}
              </td>
              <td className="px-4 py-2 text-neutral-600">
                {car.selling_price != null ? formatCurrency(car.selling_price) : "—"}
                {car.floor_price != null && (
                  <span className="text-neutral-400">
                    {" "}
                    / 底{" "}
                    {canViewCost ? formatCurrency(car.floor_price) : "🔒"}
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right">
                {canEditCars && (
                  <div className="flex items-center justify-end gap-2">
                    <CarQuickActions car={car} />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(car);
                      }}
                      className="text-neutral-400 underline-offset-2 hover:text-[#A6793D] hover:underline"
                    >
                      編輯
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
