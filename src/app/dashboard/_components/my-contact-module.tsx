"use client";

import { useActionState, useState } from "react";
import { updateMyPublicContact, type MyContactState } from "../staff-actions";
import { useImageCompressOnChange } from "./use-image-compress-on-change";

const initialState: MyContactState = {};

const INPUT_CLASS =
  "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

/**
 * 「我的公開聯繫方式」——每一位登入的員工（不限管理員，任何角色都看得到
 * 這個分頁，見 dashboard-shell.tsx 的 `modules` 清單，這一項故意不用
 * `permissions.canManageStaff` 擋，因為這是「改自己的資料」不是管理功能）
 * 自助填寫電話／個人 LINE／自我介紹／大頭照，並自己決定要不要公開顯示在
 * 顧客看車頁（/inventory）的「聯繫我們的業務」區塊。
 *
 * 簡介跟大頭照是後來加的——單純一個電話號碼對顧客來說不太有「信任感」，
 * 有照片、有一段自我介紹，比較接近「認識這個人」而不是「看到一組數字」，
 * 見 showroom-page.tsx 團隊卡片怎麼呈現這兩個欄位。
 *
 * 不勾選公開，這裡填的資料就只存在資料庫、不會出現在任何前台頁面——
 * 跟車行的「品牌設定」分頁（官方電話/LINE，車行管理員填、全車行共用）
 * 是兩件不同的事：這裡是「業務個人」的聯繫方式，選填、也可以隨時關掉。
 */
export function MyContactModule({
  myContact,
}: {
  myContact: {
    public_phone: string | null;
    public_line_id: string | null;
    show_public_contact: boolean;
    public_bio: string | null;
    public_avatar_url: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(updateMyPublicContact, initialState);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(myContact.public_avatar_url);

  function handleAvatarSelected(file: File) {
    setAvatarPreview(URL.createObjectURL(file));
  }

  const { onChange: onAvatarChange, compressing: avatarCompressing } =
    useImageCompressOnChange(handleAvatarSelected);

  return (
    <section className="max-w-2xl">
      <h2 className="text-base font-semibold text-neutral-800">我的公開聯繫方式</h2>
      <p className="mt-0.5 text-xs text-neutral-400">
        這裡是你個人的照片、簡介、電話／LINE，選填。勾選「在顧客前台公開」之後，才會出現在顧客看車頁（/inventory）的「聯繫我們的業務」區塊，讓有興趣的顧客直接找你——不勾選就只存在後台，不會被任何人看到。
      </p>

      <form
        action={formAction}
        className="mt-5 space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
      >
        <div>
          <label className="block text-sm font-medium text-neutral-700">大頭照</label>
          <div className="mt-2 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-50">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- 網址來自 Supabase Storage 公開 bucket 或本機預覽 blob URL。
                <img src={avatarPreview} alt="大頭照預覽" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl text-neutral-300">🙂</span>
              )}
            </div>
            <div className="flex-1">
              <input
                type="file"
                name="public_avatar"
                accept="image/*"
                onChange={onAvatarChange}
                className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#BFA074] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#AD9066]"
              />
              {avatarCompressing && (
                <p className="mt-1 text-xs text-neutral-400">圖片壓縮中…</p>
              )}
              <p className="mt-1 text-xs text-neutral-400">
                {myContact.public_avatar_url ? "已有照片，重新選擇檔案即可更換；不選則維持原樣。" : "建議使用清楚的正面照，比純文字聯絡方式更有信任感。"}
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">自我介紹</label>
          <textarea
            name="public_bio"
            defaultValue={myContact.public_bio ?? ""}
            rows={3}
            placeholder="例如：我是專員小陳，主跑日系房車，服務過上百組客戶，歡迎找我聊聊你的需求！"
            className={INPUT_CLASS + " mt-1 resize-y"}
          />
          <p className="mt-1 text-xs text-neutral-400">選填，讓顧客在聯繫你之前先認識你一點，拉近距離。</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">個人電話</label>
            <input
              name="public_phone"
              defaultValue={myContact.public_phone ?? ""}
              placeholder="例如：0912-345-678"
              className={INPUT_CLASS + " mt-1"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">個人 LINE ID</label>
            <input
              name="public_line_id"
              defaultValue={myContact.public_line_id ?? ""}
              placeholder="例如：sales_amy"
              className={INPUT_CLASS + " mt-1"}
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700">
          <input
            type="checkbox"
            name="show_public_contact"
            defaultChecked={myContact.show_public_contact}
            className="h-4 w-4 rounded border-neutral-300 text-[#BFA074] focus:ring-[#BFA074]"
          />
          在顧客前台公開我的聯繫方式
        </label>

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
            ✓ {state.success}
          </p>
        )}

        <div className="flex justify-end border-t border-neutral-200 pt-4">
          <button
            type="submit"
            disabled={pending || avatarCompressing}
            className="rounded-lg bg-[#BFA074] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "儲存中…" : avatarCompressing ? "圖片處理中…" : "儲存變更"}
          </button>
        </div>
      </form>
    </section>
  );
}
