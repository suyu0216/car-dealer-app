"use client";

import { useEffect, useMemo, useState } from "react";
import type { Car, RepairItem, Role } from "@/lib/supabase/types";
import type { EffectivePermissions } from "@/lib/permissions";
import { CarsKpi } from "./cars-kpi";
import { CarFilterBar, defaultCarFilters, type CarFilters } from "./car-filter-bar";
import { CarTable } from "./car-table";
import { CarGallery } from "./car-gallery";
import { CarDetailModal } from "./car-detail-modal";
import { CarFormModal } from "./car-form-modal";
import { CarTrashPanel } from "./car-trash-panel";

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; car: Car }
  | { mode: "view"; car: Car }
  | null;

function matchesKeyword(car: Car, keyword: string) {
  if (!keyword.trim()) return true;
  const haystack = [car.model_name, car.license_plate, car.vin, car.brand]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword.trim().toLowerCase());
}

export function CarsManager({
  cars,
  repairItems,
  receiptUrls,
  role,
  permissions,
  tenantName,
}: {
  cars: Car[];
  repairItems: RepairItem[];
  receiptUrls: Record<string, string>;
  role: Role;
  permissions: EffectivePermissions;
  tenantName?: string;
}) {
  const [view, setView] = useState<"table" | "gallery">("gallery");
  const [showTrash, setShowTrash] = useState(false);
  const [modalState, setModalState] = useState<ModalState>(null);

  // 軟刪除的車輛（deleted_at 非 null）預設從庫存列表隱藏——不進 KPI、
  // 不進篩選/表格/藝廊卡片，只在「已刪除」面板（showTrash）看得到、可以
  // 復原。見 cars-actions.ts 的 deleteCar()/restoreCar() 說明。
  const activeCars = useMemo(() => cars.filter((c) => !c.deleted_at), [cars]);
  const deletedCars = useMemo(() => cars.filter((c) => c.deleted_at), [cars]);
  // 車輛新增/編輯 Modal 關閉後的非阻斷性警告（目前唯一情境：照片上傳失敗，
  // 但車輛本身已經存檔成功）。用 Toast 顯示幾秒鐘後自動消失，不擋任何操作。
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  function closeFormModal(warning?: string) {
    setModalState(null);
    if (warning) setToast(warning);
  }

  const brands = useMemo(() => {
    const set = new Set(activeCars.map((c) => c.brand).filter((b): b is string => !!b));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activeCars]);

  const priceBounds = useMemo(() => {
    const prices = activeCars.map((c) => Number(c.selling_price ?? 0));
    return {
      min: 0,
      max: prices.length > 0 ? Math.max(...prices, 100000) : 5000000,
    };
  }, [activeCars]);

  const [filters, setFilters] = useState<CarFilters>(() =>
    defaultCarFilters(priceBounds.min, priceBounds.max)
  );

  const filteredCars = activeCars.filter((car) => {
    if (!matchesKeyword(car, filters.keyword)) return false;
    if (filters.brand !== "all" && car.brand !== filters.brand) return false;
    if (filters.status !== "all" && car.status !== filters.status) return false;
    if (filters.yearMin && (car.year ?? 0) < Number(filters.yearMin)) return false;
    if (filters.yearMax && (car.year ?? Infinity) > Number(filters.yearMax)) return false;
    if (filters.mileageMax && (car.mileage ?? 0) > Number(filters.mileageMax)) return false;
    // 沒填開價的車輛（selling_price 為 null）不因為價格區間篩選被排除，
    // 避免「還沒訂價」的整備中車輛在調整滑桿時憑空消失。
    if (car.selling_price != null) {
      if (car.selling_price < filters.priceMin || car.selling_price > filters.priceMax) {
        return false;
      }
    }
    return true;
  });

  return (
    <section className="rounded-2xl border border-neutral-200 bg-[#F8F9FA] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral-800">車輛進銷存</h2>
        <div className="flex items-center gap-2">
          {/* 表格／藝廊卡片 一鍵切換 */}
          <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView("gallery")}
              className={
                "rounded-md px-2.5 py-1 font-medium transition " +
                (view === "gallery"
                  ? "bg-[#BFA074] text-white"
                  : "text-neutral-500 hover:text-neutral-800")
              }
            >
              🖼 藝廊卡片
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              className={
                "rounded-md px-2.5 py-1 font-medium transition " +
                (view === "table"
                  ? "bg-[#BFA074] text-white"
                  : "text-neutral-500 hover:text-neutral-800")
              }
            >
              ☰ 清單表格
            </button>
          </div>
          {permissions.canEditCars && deletedCars.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTrash((v) => !v)}
              className={
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition " +
                (showTrash
                  ? "border-[#BFA074] bg-white text-[#A6793D]"
                  : "border-neutral-200 bg-white text-neutral-500 hover:border-[#BFA074] hover:text-[#A6793D]")
              }
            >
              🗑 已刪除（{deletedCars.length}）
            </button>
          )}
          {permissions.canEditCars && (
            <button
              type="button"
              onClick={() => setModalState({ mode: "create" })}
              className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066]"
            >
              + 新增車輛
            </button>
          )}
        </div>
      </div>

      {showTrash ? (
        <div className="mt-4">
          <CarTrashPanel
            cars={deletedCars}
            canEditCars={permissions.canEditCars}
            onClose={() => setShowTrash(false)}
          />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <CarsKpi cars={activeCars} repairItems={repairItems} canViewCost={permissions.canViewCost} />
          </div>

          <CarFilterBar
            filters={filters}
            onChange={setFilters}
            brands={brands}
            priceBounds={priceBounds}
          />

          <div className="mt-4">
            {view === "table" ? (
              <CarTable
                cars={filteredCars}
                canViewCost={permissions.canViewCost}
                canEditCars={permissions.canEditCars}
                onView={(car) => setModalState({ mode: "view", car })}
                onEdit={(car) => setModalState({ mode: "edit", car })}
              />
            ) : (
              <CarGallery
                cars={filteredCars}
                canViewCost={permissions.canViewCost}
                canEditCars={permissions.canEditCars}
                onView={(car) => setModalState({ mode: "view", car })}
                onEdit={(car) => setModalState({ mode: "edit", car })}
              />
            )}
          </div>
        </>
      )}

      {modalState?.mode === "view" && (
        <CarDetailModal
          car={modalState.car}
          role={role}
          canViewCost={permissions.canViewCost}
          canEditCars={permissions.canEditCars}
          tenantName={tenantName}
          repairItems={repairItems.filter((r) => r.car_id === modalState.car.id)}
          receiptUrls={receiptUrls}
          onClose={() => setModalState(null)}
          onEdit={() => setModalState({ mode: "edit", car: modalState.car })}
        />
      )}

      {(modalState?.mode === "create" || modalState?.mode === "edit") && (
        <CarFormModal
          mode={modalState.mode}
          car={modalState.mode === "edit" ? modalState.car : undefined}
          canViewCost={permissions.canViewCost}
          onClose={closeFormModal}
        />
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className="flex max-w-lg items-start gap-3 rounded-2xl border border-[#F0DFC0] bg-[#FBF1E4] px-4 py-3 text-sm text-[#8A5F24] shadow-lg">
            <span className="mt-0.5">⚠️</span>
            <p className="flex-1">{toast}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="關閉提示"
              className="text-[#B4813E] hover:text-[#8A5F24]"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
