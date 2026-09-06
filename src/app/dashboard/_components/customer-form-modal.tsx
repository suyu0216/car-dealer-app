"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createCustomer,
  updateCustomer,
  getCustomerIdPhotos,
  deleteCustomerIdPhoto,
  type CustomerFormState,
} from "../customers-actions";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";
import { useMultiImageCompressOnChange } from "./use-image-compress-on-change";
import { VALID_CUSTOMER_TYPES } from "@/lib/supabase/types";
import type { Customer, CustomerFollowUpStatus } from "@/lib/supabase/types";

/** 客戶證件照片一次最多上傳 10 張——跟 customers-actions.ts 的
 * MAX_CUSTOMER_ID_PHOTOS 保持一致，這裡只是給前端提示文字/選檔張數
 * 提醒用，真正擋下超額上傳的是伺服器端那份。 */
const MAX_ID_PHOTOS = 10;

export const FOLLOW_UP_LABEL: Record<CustomerFollowUpStatus, string> = {
  new: "新名單",
  test_drive_followup: "試駕後回訪",
  deposit_received: "訂金已收",
  delivery_care: "交車關懷",
};

export const FOLLOW_UP_STYLE: Record<CustomerFollowUpStatus, string> = {
  new: "bg-neutral-100 text-neutral-500 ring-neutral-200",
  test_drive_followup: "bg-[#EEF1F4] text-[#5B6B7A] ring-[#DCE3E9]",
  deposit_received: "bg-[#FBF1E4] text-[#B4813E] ring-[#F0DFC0]",
  delivery_care: "bg-[#EEF2ED] text-[#5F7563] ring-[#D9E2D6]",
};

const FOLLOW_UP_OPTIONS: CustomerFollowUpStatus[] = [
  "new",
  "test_drive_followup",
  "deposit_received",
  "delivery_care",
];

const initialState: CustomerFormState = {};
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

export function CustomerFormModal({
  mode,
  customer,
  onClose,
}: {
  mode: "create" | "edit";
  customer?: Customer;
  /** 2026-09-06 調整：存檔成功時呼叫；如果客戶本身存成功、但證件照片
   * 上傳失敗，會帶一句 warning 訊息上去，讓外層（CrmModule）用 Toast
   * 顯示，跟 car-form-modal.tsx 的 onClose 是同一套設計。 */
  onClose: (warning?: string) => void;
}) {
  const action = mode === "create" ? createCustomer : updateCustomer;
  const [state, formAction, pending] = useActionState(action, initialState);
  const { markDirty, requestClose } = useUnsavedChangesGuard(onClose);

  // 2026-09-06 新增：客戶證件照片，做法跟 car-form-modal.tsx 的賣家證件
  // 照片是同一套——一次可選多張、上傳前先壓縮，既有照片（編輯模式）
  // 另外呼叫 Server Action 現查現簽 signed URL 顯示（私有 bucket）。
  const [selectedPhotoNames, setSelectedPhotoNames] = useState<string[]>([]);
  const { onChange: onPhotosChange, compressing: photoCompressing } = useMultiImageCompressOnChange((files) =>
    setSelectedPhotoNames(files.map((f) => f.name))
  );
  const [existingPhotos, setExistingPhotos] = useState<{ id: string; url: string }[]>([]);
  useEffect(() => {
    if (mode !== "edit" || !customer) return;
    let cancelled = false;
    getCustomerIdPhotos(customer.id).then((photos) => {
      if (!cancelled) setExistingPhotos(photos);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, customer?.id]);

  async function handleRemovePhoto(photoId: string) {
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
    await deleteCustomerIdPhoto(photoId);
  }

  useEffect(() => {
    if (state?.success) onClose(state.warning);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    // 背景不綁 onClick，避免點外面誤觸清掉表單。
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4 py-8">
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-800">
            {mode === "create" ? "新增客戶" : "編輯客戶"}
          </h3>
          <button type="button" onClick={requestClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>

        <form action={formAction} onChange={markDirty} className="mt-4 space-y-4">
          {mode === "edit" && customer && <input type="hidden" name="id" value={customer.id} />}

          <div className="grid grid-cols-2 gap-3">
            <Field label="客戶姓名" name="name" defaultValue={customer?.name ?? ""} required />
            <Field label="電話" name="phone" defaultValue={customer?.phone ?? ""} />
          </div>

          {/* 2026-09-06 新增：跟競品 Hocar 比較後補上的客戶分類——預設
              「個人」，既有客戶資料也視同個人，不強制回填。 */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">客戶類型</label>
            <select
              name="customer_type"
              defaultValue={customer?.customer_type ?? "個人"}
              className={INPUT_CLASS}
            >
              {VALID_CUSTOMER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <Field
            label="感興趣車款"
            name="interested_model"
            defaultValue={customer?.interested_model ?? ""}
            placeholder="例如：Toyota Camry"
          />

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="預算下限"
              name="budget_min"
              type="number"
              defaultValue={customer?.budget_min != null ? String(customer.budget_min) : ""}
            />
            <Field
              label="預算上限"
              name="budget_max"
              type="number"
              defaultValue={customer?.budget_max != null ? String(customer.budget_max) : ""}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">跟進狀態</label>
            <select
              name="follow_up_status"
              defaultValue={customer?.follow_up_status ?? "new"}
              className={INPUT_CLASS}
            >
              {FOLLOW_UP_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {FOLLOW_UP_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <Field
            label="LINE ID（預留欄位）"
            name="line_id"
            defaultValue={customer?.line_id ?? ""}
            placeholder="尚未綁定官方帳號，先手動記錄"
          />

          <div>
            <label className="block text-sm font-medium text-neutral-700">備註</label>
            <textarea
              name="note"
              defaultValue={customer?.note ?? ""}
              rows={2}
              className={INPUT_CLASS + " resize-y"}
            />
          </div>

          {/* 2026-09-06 新增：客戶證件照片，最多 10 張——跟車輛表單的
              賣家證件照片是同一套模式，私有 bucket，顯示時要另外簽
              signed URL。 */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              證件照片（可一次選多張，最多 {MAX_ID_PHOTOS} 張）
            </label>
            <input
              type="file"
              name="id_photos"
              accept="image/*"
              multiple
              onChange={onPhotosChange}
              className="mt-1 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#BFA074] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#AD9066]"
            />
            {photoCompressing && <p className="mt-1 text-xs text-neutral-400">圖片壓縮中…</p>}
            {!photoCompressing && selectedPhotoNames.length > 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                已選 {selectedPhotoNames.length} 張：{selectedPhotoNames.join("、")}
              </p>
            )}
            {existingPhotos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {existingPhotos.map((p) => (
                  <div key={p.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt="客戶證件照片"
                      className="h-16 w-16 rounded-lg border border-neutral-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(p.id)}
                      aria-label="移除這張照片"
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800/80 text-xs text-white hover:bg-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-neutral-400">🔒 證件照片存放於私有空間，不會公開顯示。</p>
          </div>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending || photoCompressing}
              className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:opacity-60"
            >
              {pending ? "儲存中…" : photoCompressing ? "圖片處理中…" : "儲存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-neutral-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        className={INPUT_CLASS}
      />
    </div>
  );
}
