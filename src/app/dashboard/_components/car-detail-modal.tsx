"use client";

import { useState, useTransition } from "react";
import type { Car, RepairItem, Role } from "@/lib/supabase/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { CarStatusBadge, STATUS_LABEL, STATUS_OPTIONS } from "./car-status-badge";
import { CarAgingBadge } from "./car-aging-badge";
import { CarMaintenanceTab } from "./car-maintenance-tab";
import { deleteCar, updateCarStatus } from "../cars-actions";

// 狀態切換的快捷用語，比直接顯示英文/籠統的中文更貼近實際操作情境。
const QUICK_ACTION_LABEL: Record<Car["status"], string> = {
  preparing: "退回整備中",
  in_stock: "整備完成上架",
  reserved: "設為已預訂",
  sold: "設為已售出",
};

export function CarDetailModal({
  car,
  role,
  canViewCost,
  canEditCars,
  tenantName,
  repairItems,
  receiptUrls,
  onClose,
  onEdit,
}: {
  car: Car;
  role: Role;
  /** 收購進價/過戶費/整理美容/整備維修/底價/最終成交價都算敏感成本資訊。 */
  canViewCost: boolean;
  canEditCars: boolean;
  tenantName?: string;
  repairItems: RepairItem[];
  receiptUrls: Record<string, string>;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState<"info" | "maintenance">("info");
  const [pending, startTransition] = useTransition();
  const tags = (car.equipment_tags ?? "")
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);

  function handleQuickStatus(status: Car["status"]) {
    startTransition(() => {
      updateCarStatus(car.id, status);
    });
  }

  function handleDelete() {
    const name = [car.brand, car.model_name].filter(Boolean).join(" ");
    const confirmed = window.confirm(
      `確定要刪除「${name}」嗎？\n\n刪除後會從庫存列表隱藏，但資料不會馬上消失，之後可以到「已刪除」清單復原。`
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteCar(car.id);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    // 背景不綁 onClick：這個彈窗裡的「維修請款與會計」分頁可能有填到一半
    // 的內嵌表單，點外面不該直接關掉整個詳情頁。
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4 py-8 print:static print:bg-transparent print:p-0">
      {/* 列印用樣式：印表時只顯示 .car-spec-sheet，其餘畫面全部隱藏。 */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .car-spec-sheet, .car-spec-sheet * { visibility: visible; }
          .car-spec-sheet { position: fixed; inset: 0; }
        }
      `}</style>

      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-xl print:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 主圖 + 標題 */}
        <div className="relative aspect-[21/9] w-full overflow-hidden bg-neutral-100">
          {car.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={car.image_url}
              alt={car.model_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl text-neutral-300">
              🚗
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="absolute right-3 top-3 rounded-full bg-white/80 px-2.5 py-1 text-neutral-500 backdrop-blur hover:text-neutral-800"
          >
            ✕
          </button>
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-white/95 to-transparent p-4">
            <div>
              <p className="text-xs font-medium text-[#A6793D]">{car.brand ?? "未標示廠牌"}</p>
              <h2 className="text-xl font-semibold text-neutral-800">{car.model_name}</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <CarAgingBadge car={car} className="bg-white/90 backdrop-blur" />
              <CarStatusBadge status={car.status} />
            </div>
          </div>
        </div>

        {/* 分頁切換 */}
        <div className="flex gap-1 border-b border-neutral-200 px-5 pt-3">
          <TabButton active={tab === "info"} onClick={() => setTab("info")}>
            車輛資訊
          </TabButton>
          <TabButton active={tab === "maintenance"} onClick={() => setTab("maintenance")}>
            維修請款與會計
            {repairItems.some((r) => r.status === "pending") && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#B4813E]" />
            )}
          </TabButton>
        </div>

        {tab === "maintenance" ? (
          <div className="p-5">
            <CarMaintenanceTab
              car={car}
              repairItems={repairItems}
              role={role}
              canViewCost={canViewCost}
              receiptUrls={receiptUrls}
            />
          </div>
        ) : (
        <div className="space-y-6 p-5">
          {/* 快捷操作：一鍵切換車輛狀態 */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              快捷操作
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {STATUS_OPTIONS.filter((s) => s !== car.status).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={pending}
                  onClick={() => handleQuickStatus(s)}
                  className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-[#BFA074] hover:text-[#A6793D] disabled:opacity-50"
                >
                  {QUICK_ACTION_LABEL[s]}
                </button>
              ))}
            </div>
          </section>

          {/* 基本規格 */}
          <Section title="基本規格">
            <SpecGrid>
              <Spec label="廠牌" value={car.brand} />
              <Spec label="車型" value={car.model_name} />
              <Spec label="出廠年份" value={car.year ? `${car.year} 年` : null} />
              <Spec label="領牌年份" value={car.license_year ? `${car.license_year} 年` : null} />
              <Spec
                label="里程數"
                value={car.mileage != null ? `${formatNumber(car.mileage)} km` : null}
              />
              <Spec label="排氣量" value={car.engine_cc ? `${formatNumber(car.engine_cc)} cc` : null} />
              <Spec label="傳動/變速箱" value={car.transmission} />
              <Spec label="車身顏色" value={car.color} />
              <Spec label="車牌號碼" value={car.license_plate} />
              <Spec label="VIN 車身號碼" value={car.vin} />
            </SpecGrid>
          </Section>

          {/* 車況與認證 */}
          <Section title="車況與認證">
            <SpecGrid>
              <Spec label="認證狀態" value={car.certification} />
            </SpecGrid>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {car.condition_notes && (
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
                {car.condition_notes}
              </p>
            )}
          </Section>

          {/* 財務與成本結構：展示開價每個人都要看得到（要跟客戶報價），
              其餘收購成本/規費/整備/底價/最終成交價都是敏感財務資訊，
              沒有 canViewCost 權限就整格遮罩。 */}
          <Section title="財務與成本結構">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Money label="收購進價" value={car.purchase_price} mask={!canViewCost} />
              <Money label="過戶費/規費" value={car.transfer_fee} mask={!canViewCost} />
              <Money label="整理美容成本" value={car.detailing_cost} mask={!canViewCost} />
              <Money label="整備維修成本" value={car.repair_cost} mask={!canViewCost} />
              <Money label="預計底價" value={car.floor_price} mask={!canViewCost} />
              <Money label="展示開價" value={car.selling_price} highlight />
              <Money label="最終成交價" value={car.final_price} mask={!canViewCost} highlight />
            </div>
          </Section>

          {/* 操作列 */}
          <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-[#BFA074] hover:text-[#A6793D]"
            >
              🖨️ 列印展示卡
            </button>
            {canEditCars && (
              <button
                type="button"
                disabled={pending}
                onClick={handleDelete}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-500 transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                🗑 刪除車輛
              </button>
            )}
            {canEditCars && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066]"
              >
                編輯車輛
              </button>
            )}
          </div>
        </div>
        )}
      </div>

      {/* 印表專用展示卡：畫面上永遠隱藏，只有觸發列印時才顯示（見上面的 @media print）。 */}
      <div className="car-spec-sheet hidden bg-white p-10 text-neutral-800 print:block">
        <div className="flex items-center justify-between border-b-2 border-neutral-800 pb-4">
          <div>
            <p className="text-sm text-neutral-500">{tenantName ?? "中古車行"}</p>
            <h1 className="text-3xl font-bold">
              {car.brand} {car.model_name}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-sm text-neutral-500">開價</p>
            <p className="text-4xl font-bold">
              {car.selling_price != null ? formatCurrency(car.selling_price) : "洽詢"}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 text-lg">
          <PrintSpec label="年式" value={car.year ? `${car.year} 年` : "—"} />
          <PrintSpec
            label="里程"
            value={car.mileage != null ? `${formatNumber(car.mileage)} km` : "—"}
          />
          <PrintSpec label="排氣量" value={car.engine_cc ? `${formatNumber(car.engine_cc)} cc` : "—"} />
          <PrintSpec label="變速箱" value={car.transmission ?? "—"} />
          <PrintSpec label="顏色" value={car.color ?? "—"} />
          <PrintSpec label="車牌" value={car.license_plate ?? "—"} />
        </div>

        {tags.length > 0 && (
          <div className="mt-6">
            <p className="text-sm text-neutral-500">配備</p>
            <p className="mt-1 text-base">{tags.join("・")}</p>
          </div>
        )}

        {car.certification && (
          <p className="mt-4 inline-block rounded border border-neutral-800 px-3 py-1 text-sm font-medium">
            ✓ {car.certification}
          </p>
        )}

        <p className="mt-10 text-xs text-neutral-400">
          本展示卡資訊僅供參考，實際車況與價格請以現場為準。
        </p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "-mb-px flex items-center border-b-2 px-3 py-2 text-sm font-medium transition " +
        (active
          ? "border-[#BFA074] text-[#A6793D]"
          : "border-transparent text-neutral-400 hover:text-neutral-600")
      }
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function SpecGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">{children}</div>;
}

function Spec({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p className="text-sm text-neutral-700">{value ?? "—"}</p>
    </div>
  );
}

function Money({
  label,
  value,
  mask = false,
  highlight = false,
}: {
  label: string;
  value: number | null | undefined;
  mask?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p
        className={
          "text-sm font-medium tabular-nums " + (highlight ? "text-[#A6793D]" : "text-neutral-700")
        }
      >
        {mask ? "🔒 權限不足" : value != null ? formatCurrency(value) : "—"}
      </p>
    </div>
  );
}

function PrintSpec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
