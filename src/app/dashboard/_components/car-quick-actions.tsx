"use client";

import { useTransition } from "react";
import type { Car } from "@/lib/supabase/types";
import { deleteCar, updateCarStatus } from "../cars-actions";

const BUTTON_CLASS =
  "rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:border-[#BFA074] hover:text-[#A6793D] disabled:cursor-not-allowed disabled:opacity-50";
const DELETE_BUTTON_CLASS =
  "rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-400 transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * 庫存列表（表格/藝廊卡片）用的快捷操作：保留⇄取消保留、刪除。
 * 直接呼叫 Server Action（跟 car-detail-modal.tsx 的快捷狀態切換同一套
 * 模式），revalidatePath 會讓 Server Component 重新抓資料、自動反映到
 * 列表上，不需要額外的樂觀更新或狀態提升到 CarsManager。
 *
 * 只在 in_stock ⇄ reserved 之間切換——preparing/sold 這兩個狀態變動意義
 * 比較重大（退回整備、結帳售出），維持只能在車輛詳情彈窗的「快捷操作」
 * 或編輯表單裡處理，避免在列表上被誤觸。
 */
export function CarQuickActions({ car, className = "" }: { car: Car; className?: string }) {
  const [pending, startTransition] = useTransition();

  const canToggleReserve = car.status === "in_stock" || car.status === "reserved";
  const nextReserveStatus: Car["status"] = car.status === "reserved" ? "in_stock" : "reserved";
  const reserveLabel = car.status === "reserved" ? "↩️ 取消保留" : "🔖 保留";

  function handleToggleReserve(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      const result = await updateCarStatus(car.id, nextReserveStatus);
      if (result?.error) window.alert(result.error);
    });
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const name = [car.brand, car.model_name].filter(Boolean).join(" ");
    const confirmed = window.confirm(
      `確定要刪除「${name}」嗎？\n\n刪除後會從庫存列表隱藏，但資料不會馬上消失，之後可以到「已刪除」清單復原。`
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteCar(car.id);
      if (result?.error) window.alert(result.error);
    });
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {canToggleReserve && (
        <button type="button" disabled={pending} onClick={handleToggleReserve} className={BUTTON_CLASS}>
          {reserveLabel}
        </button>
      )}
      <button type="button" disabled={pending} onClick={handleDelete} className={DELETE_BUTTON_CLASS}>
        🗑 刪除
      </button>
    </span>
  );
}
