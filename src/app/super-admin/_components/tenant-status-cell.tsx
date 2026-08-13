"use client";

import { useState, useTransition } from "react";
import { updateTenantStatus } from "../tenant-admin-actions";
import type { TenantStatus } from "@/lib/supabase/types";

const STATUS_LABEL: Record<TenantStatus, string> = {
  pending: "待審核",
  active: "已開通",
  suspended: "已停權",
};

const STATUS_STYLE: Record<TenantStatus, string> = {
  pending: "bg-[#FBF3E7] text-[#A6793D] ring-[#F0E0C4]",
  active: "bg-[#EEF2ED] text-[#5F7563] ring-[#D9E2D6]",
  suspended: "bg-[#FBEAE8] text-[#B23A2E] ring-[#F3D3CF]",
};

const BUTTON_CLASS =
  "rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:border-[#BFA074] hover:text-[#A6793D] disabled:cursor-not-allowed disabled:opacity-50";

/** 車商狀態徽章 + 開通/停權/恢復操作按鈕。成功後直接用本機 state 樂觀
 * 更新徽章（不用等頁面重新整理），Server Action 那邊仍然會
 * revalidatePath 讓底層資料保持一致。 */
export function TenantStatusCell({
  tenantId,
  status,
}: {
  tenantId: string;
  status: TenantStatus;
}) {
  const [current, setCurrent] = useState<TenantStatus>(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: TenantStatus, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const result = await updateTenantStatus(tenantId, next);
      if (result?.error) {
        setError(result.error);
      } else {
        setCurrent(next);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[current]}`}
      >
        {STATUS_LABEL[current]}
      </span>

      {current === "pending" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => handleChange("active")}
          className={BUTTON_CLASS}
        >
          ✓ 核准開通
        </button>
      )}
      {current === "active" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => handleChange("suspended", "確定要停權這間車行嗎？停權後他們的後台會整個無法使用。")}
          className={BUTTON_CLASS}
        >
          停權
        </button>
      )}
      {current === "suspended" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => handleChange("active")}
          className={BUTTON_CLASS}
        >
          恢復開通
        </button>
      )}

      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
