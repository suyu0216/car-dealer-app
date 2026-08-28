"use client";

import type { Car } from "@/lib/supabase/types";
import { CarCard } from "./car-card";

export function CarGallery({
  cars,
  canViewCost,
  canEditCars,
  repairCostByCar,
  onView,
  onEdit,
}: {
  cars: Car[];
  canViewCost: boolean;
  canEditCars: boolean;
  /** 每輛車已核准撥款的整備維修費用加總，見 cars-manager.tsx 的
   * computeApprovedPrepCostByCar()。 */
  repairCostByCar: Map<string, number>;
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cars.map((car) => (
        <CarCard
          key={car.id}
          car={car}
          canViewCost={canViewCost}
          canEditCars={canEditCars}
          repairCost={repairCostByCar.get(car.id) ?? 0}
          onView={onView}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
