"use client";

import { useActionState, useState } from "react";
import { updateTenantProfile, type TenantProfileState } from "../tenant-actions";
import type { Tenant } from "@/lib/supabase/types";

const initialState: TenantProfileState = {};

const INPUT_CLASS =
  "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

/**
 * 車行品牌設定：名稱/電話/地址/營業時間/LINE/Logo，這幾個欄位會直接影響
 * 前台展間（/inventory）的頁首顯示（見 showroom-page.tsx）。只有車行管理員
 * 看得到這個分頁（見 dashboard-shell.tsx 用 permissions.canManageStaff
 * 決定要不要顯示這個分頁），Server Action 也有同一層權限檢查。
 */
export function BrandSettingsModule({ tenant }: { tenant: Tenant }) {
  const [state, formAction, pending] = useActionState(updateTenantProfile, initialState);
  const [logoPreview, setLogoPreview] = useState<string | null>(tenant.logo_url);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
  }

  return (
    <section className="max-w-2xl">
      <h2 className="text-base font-semibold text-neutral-800">車行品牌設定</h2>
      <p className="mt-0.5 text-xs text-neutral-400">
        這裡填的名稱、電話、地址、營業時間、Logo 會直接顯示在顧客看車頁（/inventory）的頁首。
      </p>

      <form action={formAction} className="mt-5 space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        {/* Logo */}
        <div>
          <label className="block text-sm font-medium text-neutral-700">車行 Logo</label>
          <div className="mt-2 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- Logo 網址來自 Supabase Storage 公開 bucket 或本機預覽 blob URL。
                <img src={logoPreview} alt="車行 Logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-2xl text-neutral-300">🏪</span>
              )}
            </div>
            <div className="flex-1">
              <input
                type="file"
                name="logo"
                accept="image/*"
                onChange={handleLogoChange}
                className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#BFA074] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#AD9066]"
              />
              <p className="mt-1 text-xs text-neutral-400">
                {tenant.logo_url ? "已有 Logo，重新選擇檔案即可更換；不選則維持原樣。" : "建議使用正方形圖片，透明背景效果最好。"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">車行名稱</label>
            <input
              name="name"
              defaultValue={tenant.name}
              required
              placeholder="例如：捷恒汽車"
              className={INPUT_CLASS + " mt-1"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">聯絡電話</label>
            <input
              name="phone"
              defaultValue={tenant.phone ?? ""}
              placeholder="例如：03-535-5216"
              className={INPUT_CLASS + " mt-1"}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">地址</label>
          <input
            name="address"
            defaultValue={tenant.address ?? ""}
            placeholder="例如：新竹市東區經國路一段289號"
            className={INPUT_CLASS + " mt-1"}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">營業時間</label>
            <input
              name="business_hours"
              defaultValue={tenant.business_hours ?? ""}
              placeholder="例如：週一至週日 09:30-23:00"
              className={INPUT_CLASS + " mt-1"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">LINE 官方帳號 / ID</label>
            <input
              name="line_id"
              defaultValue={tenant.line_id ?? ""}
              placeholder="例如：@687lwemu"
              className={INPUT_CLASS + " mt-1"}
            />
          </div>
        </div>

        {state?.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
            {state.error}
          </p>
        )}
        {state?.warning && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-inset ring-amber-100">
            {state.warning}
          </p>
        )}
        {state?.success && !state?.error && (
          <p className="rounded-lg bg-[#EEF2ED] px-3 py-2 text-sm text-[#5F7563] ring-1 ring-inset ring-[#D9E2D6]">
            ✓ 已儲存
          </p>
        )}

        <div className="flex justify-end border-t border-neutral-200 pt-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[#BFA074] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "儲存中…" : "儲存變更"}
          </button>
        </div>
      </form>
    </section>
  );
}
