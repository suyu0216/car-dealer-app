"use client";

import { useTransition } from "react";
import type { Car } from "@/lib/supabase/types";
import { restoreCar } from "../cars-actions";

/** 「已刪除」清單：軟刪除的車輛在這裡復原，見 cars-actions.ts 的 deleteCar()/
 * restoreCar() 說明——資料本身沒有真的被刪掉，只是從庫存列表隱藏。 */
export function CarTrashPanel({
  cars,
  canEditCars,
  onClose,
}: {
  cars: Car[];
  canEditCars: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleRestore(carId: string) {
    startTransition(async () => {
      const result = await restoreCar(carId);
      if (result?.error) window.alert(result.error);
    });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">🗑 已刪除的車輛（{cars.length}）</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-neutral-400 underline-offset-2 hover:text-[#A6793D] hover:underline"
        >
          ← 返回庫存列表
        </button>
      </div>

      {cars.length === 0 ? (
        <p className="mt-6 py-6 text-center text-sm text-neutral-400">目前沒有已刪除的車輛。</p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100">
          {cars.map((car) => (
            <li key={car.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-neutral-700">
                  {car.brand ? `${car.brand} ` : ""}
                  {car.model_name}
                </p>
                <p className="text-xs text-neutral-400">
                  刪除時間：{car.deleted_at ? new Date(car.deleted_at).toLocaleString("zh-TW") : "—"}
                </p>
              </div>
              {canEditCars && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleRestore(car.id)}
                  className="shrink-0 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-[#BFA074] hover:text-[#A6793D] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ↩️ 復原
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
