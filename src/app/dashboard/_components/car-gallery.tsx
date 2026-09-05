"use client";

import type { Car } from "@/lib/supabase/types";
import { CarCard } from "./car-card";

export function CarGallery({
  cars,
  canViewCost,
  canViewCommission,
  canEditCars,
  repairCostByCar,
  showCost,
  onView,
  onEdit,
}: {
  cars: Car[];
  canViewCost: boolean;
  /** 業務抽成屬於薪資隱私，是否顯示見 car-card.tsx 的說明。 */
  canViewCommission: boolean;
  canEditCars: boolean;
  /** 每輛車已核准撥款的整備維修費用加總，見 cars-manager.tsx 的
   * computeApprovedPrepCostByCar()。 */
  repairCostByCar: Map<string, number>;
  /** 大圖卡片上「成本＋開銷」那一行的顯示開關，見 car-card.tsx 的說明。 */
  showCost: boolean;
  onView: (car: Car) => void;
  onEdit: (car: Car) => void;
}) {
  if (cars.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-12 text-center text-neutral-400 shadow-sm">
        沒有符合篩選條件的車輛
      </div>
    );
  }

  return (
    // 2026-08-30：「藝廊卡片」改成大圖卡片——原本一排最多塞到 4 張
    // （xl:grid-cols-4），卡片跟裡面的車輛照片都偏小；改成一排最多 3 張
    // （下面 CarCard 本身也把圖片區域、標題、價格字級都放大），每張卡片
    // 分到的寬度變大，照片自然跟著放大、更容易看清楚車況，取捨是同一排
    // 能塞的車輛數變少，捲動次數會變多一點。
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {cars.map((car) => (
        <CarCard
          key={car.id}
          car={car}
          canViewCost={canViewCost}
          canViewCommission={canViewCommission}
          canEditCars={canEditCars}
          repairCost={repairCostByCar.get(car.id) ?? 0}
          showCost={showCost}
          onView={onView}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
