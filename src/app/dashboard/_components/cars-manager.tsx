"use client";

import { useEffect, useMemo, useState } from "react";
import type { Car, RepairItem } from "@/lib/supabase/types";
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

/**
 * 每輛車「已核准撥款」的整備維修費用加總——跟車輛詳情頁「維修請款與
 * 會計」分頁（car-maintenance-tab.tsx）、車行經營數據看板（cars-kpi.tsx）
 * 用的是同一套公式，維修/整備費用一律以 repair_items 這張請款紀錄表為
 * 唯一真實來源，不再讀車輛表單裡那個已經棄用、沒人在同步的
 * repair_cost 手動欄位（見 car-form-modal.tsx 拿掉那個欄位的說明）。
 * 待審核中的項目不計入，避免還沒核准撥款的金額被當成「已經花掉的錢」。
 */
function computeApprovedPrepCostByCar(repairItems: RepairItem[]) {
  const map = new Map<string, number>();
  for (const item of repairItems) {
    if (item.status !== "approved") continue;
    map.set(item.car_id, (map.get(item.car_id) ?? 0) + Number(item.amount));
  }
  return map;
}

function matchesKeyword(car: Car, keyword: string) {
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed) return true;

  const haystack = [car.model_name, car.license_plate, car.vin, car.brand]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (haystack.includes(trimmed)) return true;

  // 車牌／VIN 常見打法落差——存的可能是「ABC-1234」，但使用者直接打
  // 「ABC1234」（沒加「-」）就完全比對不到，反過來也一樣。這裡額外拿掉
  // 空格跟「-」再比對一次，兩種打法都找得到，不會因為多打/少打一個
  // 分隔符號就搜不到明明存在的車。
  const normalizedHaystack = haystack.replace(/[\s-]/g, "");
  const normalizedKeyword = trimmed.replace(/[\s-]/g, "");
  return normalizedKeyword.length > 0 && normalizedHaystack.includes(normalizedKeyword);
}

export function CarsManager({
  cars,
  repairItems,
  receiptUrls,
  permissions,
  tenantName,
  staff,
}: {
  cars: Car[];
  repairItems: RepairItem[];
  receiptUrls: Record<string, string>;
  permissions: EffectivePermissions;
  tenantName?: string;
  /** 給「上架人」顯示（car-detail-modal.tsx）跟「墊款業務/經手人」下拉選單
   * （car-maintenance-tab.tsx）用，同一份員工清單全車行共用。 */
  staff: { id: string; name: string | null }[];
}) {
  const [view, setView] = useState<"table" | "gallery">("gallery");
  const [showTrash, setShowTrash] = useState(false);
  const [modalState, setModalState] = useState<ModalState>(null);

  // 2026-08-30 新增：大圖卡片（藝廊卡片）上「成本＋開銷」那一行的顯示
  // 開關——安安想要一眼看到每台車目前的成本+開銷，但也要能自己選擇要
  // 不要顯示，預設是開啟的。這只是單純的「這個瀏覽器要不要顯示」偏好，
  // 不是权限，所以存在 localStorage 就好，不用寫進資料庫、也不用經過
  // Server Action；跟 canViewCost 是分開的兩件事——沒有 canViewCost 的
  // 人，不管這個開關開或關，卡片上一律看不到金額（見 car-card.tsx）。
  const [showCostOnCards, setShowCostOnCards] = useState(true);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("cda_showCostOnCards");
      if (stored !== null) setShowCostOnCards(stored === "true");
    } catch {
      // localStorage 被瀏覽器封鎖（例如無痕模式的某些設定）就維持預設值
      // true，不影響其他功能。
    }
  }, []);
  function toggleShowCostOnCards() {
    setShowCostOnCards((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("cda_showCostOnCards", String(next));
      } catch {
        // 存不了就算了，這次切換在畫面上還是會生效，只是重新整理後會
        // 退回預設值。
      }
      return next;
    });
  }

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

  const repairCostByCar = useMemo(() => computeApprovedPrepCostByCar(repairItems), [repairItems]);

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
          {permissions.canViewCost && view === "gallery" && (
            <button
              type="button"
              onClick={toggleShowCostOnCards}
              className={
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition " +
                (showCostOnCards
                  ? "border-[#BFA074] bg-white text-[#A6793D]"
                  : "border-neutral-200 bg-white text-neutral-500 hover:border-[#BFA074] hover:text-[#A6793D]")
              }
            >
              {showCostOnCards ? "✓ 顯示成本＋開銷" : "顯示成本＋開銷"}
            </button>
          )}
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
                repairCostByCar={repairCostByCar}
                onView={(car) => setModalState({ mode: "view", car })}
                onEdit={(car) => setModalState({ mode: "edit", car })}
              />
            ) : (
              <CarGallery
                cars={filteredCars}
                canViewCost={permissions.canViewCost}
                canEditCars={permissions.canEditCars}
                repairCostByCar={repairCostByCar}
                showCost={showCostOnCards}
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
          canReview={permissions.canApproveRepairs}
          canViewCost={permissions.canViewCost}
          canEditCars={permissions.canEditCars}
          tenantName={tenantName}
          repairItems={repairItems.filter((r) => r.car_id === modalState.car.id)}
          receiptUrls={receiptUrls}
          staff={staff}
          onClose={() => setModalState(null)}
          onEdit={() => setModalState({ mode: "edit", car: modalState.car })}
        />
      )}

      {(modalState?.mode === "create" || modalState?.mode === "edit") && (
        <CarFormModal
          mode={modalState.mode}
          car={modalState.mode === "edit" ? modalState.car : undefined}
          canViewCost={permissions.canViewCost}
          staff={staff}
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
