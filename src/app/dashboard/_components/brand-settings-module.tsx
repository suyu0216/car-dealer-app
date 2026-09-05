"use client";

import { useActionState, useState } from "react";
import { updateTenantProfile, type TenantProfileState } from "../tenant-actions";
import { useImageCompressOnChange } from "./use-image-compress-on-change";
import { VideoSettingsSection } from "./video-settings-section";
import { TenantReviewsModule } from "./tenant-reviews-module";
import { TenantHeroPhotosModule } from "./tenant-hero-photos-module";
import type { Tenant, TenantVideo } from "@/lib/supabase/types";

const initialState: TenantProfileState = {};

const INPUT_CLASS =
  "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

/**
 * 車行品牌設定：名稱/電話/地址/營業時間/LINE/Logo，這幾個欄位會直接影響
 * 前台展間（/inventory）的頁首顯示（見 showroom-page.tsx）。只有車行管理員
 * 看得到這個分頁（見 dashboard-shell.tsx 用 permissions.canManageStaff
 * 決定要不要顯示這個分頁），Server Action 也有同一層權限檢查。
 */
export function BrandSettingsModule({
  tenant,
  tenantVideos,
}: {
  tenant: Tenant;
  /** 「影音專區」現有影片清單，給下面的 VideoSettingsSection 用；獨立於
   * 這個表單的其他欄位（新增/刪除立刻生效，不用等按「儲存變更」）。 */
  tenantVideos: TenantVideo[];
}) {
  const [state, formAction, pending] = useActionState(updateTenantProfile, initialState);
  const [logoPreview, setLogoPreview] = useState<string | null>(tenant.logo_url);

  function handleLogoSelected(file: File) {
    setLogoPreview(URL.createObjectURL(file));
  }

  const { onChange: onLogoChange, compressing: logoCompressing } =
    useImageCompressOnChange(handleLogoSelected);

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
                onChange={onLogoChange}
                className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#BFA074] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#AD9066]"
              />
              {logoCompressing && (
                <p className="mt-1 text-xs text-neutral-400">圖片壓縮中…</p>
              )}
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

        <div>
          <label className="block text-sm font-medium text-neutral-700">理念與初衷</label>
          <textarea
            name="brand_story"
            defaultValue={tenant.brand_story ?? ""}
            rows={4}
            placeholder="例如：我們相信每一輛車都值得被好好對待，從收購、整備到交車，每一個環節都親自把關……"
            className={INPUT_CLASS + " mt-1 resize-y"}
          />
          <p className="mt-1 text-xs text-neutral-400">
            選填。填了會顯示在顧客看車頁（/inventory）品牌故事區塊，用來拉近跟顧客的距離、建立信任感；不填就不會顯示這個區塊。
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">服務項目</label>
          <textarea
            name="services_text"
            defaultValue={tenant.services_text ?? ""}
            rows={5}
            placeholder={"每行一項，例如：\n全額貸款\n中古車保固\n汽車美容\n代辦過戶／領牌\n汽車保險"}
            className={INPUT_CLASS + " mt-1 resize-y"}
          />
          <p className="mt-1 text-xs text-neutral-400">
            選填，一行一項服務。填了會在顧客看車頁顯示一排服務項目 icon 區塊；不填就不會顯示這個區塊。
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">品牌價值主張</label>
          <textarea
            name="value_props_text"
            defaultValue={tenant.value_props_text ?? ""}
            rows={5}
            placeholder={"每行一項，例如：\n品質保證\n價格透明\n專業團隊\n售後保固\n誠信經營"}
            className={INPUT_CLASS + " mt-1 resize-y"}
          />
          <p className="mt-1 text-xs text-neutral-400">
            選填，一行一項，建議 3～5 項。填了會在顧客看車頁顯示一排品牌價值主張 icon 區塊；不填就不會顯示這個區塊。
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">社群媒體連結</label>
          <div className="mt-1 space-y-2.5">
            <input
              name="facebook_url"
              type="url"
              defaultValue={tenant.facebook_url ?? ""}
              placeholder="Facebook 粉絲專頁網址"
              className={INPUT_CLASS}
            />
            <input
              name="instagram_url"
              type="url"
              defaultValue={tenant.instagram_url ?? ""}
              placeholder="Instagram 帳號網址"
              className={INPUT_CLASS}
            />
            <input
              name="tiktok_url"
              type="url"
              defaultValue={tenant.tiktok_url ?? ""}
              placeholder="抖音／TikTok 帳號網址"
              className={INPUT_CLASS}
            />
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            選填。填了會顯示在顧客看車頁下方的社群連結區塊；沒填的平台不會顯示對應圖示。
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">Google 評論信任徽章</label>
          <div className="mt-1 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <input
              name="google_rating"
              type="number"
              min="0"
              max="5"
              step="0.1"
              defaultValue={tenant.google_rating ?? ""}
              placeholder="星等，例如 4.8"
              className={INPUT_CLASS}
            />
            <input
              name="google_review_count"
              type="number"
              min="0"
              step="1"
              defaultValue={tenant.google_review_count ?? ""}
              placeholder="評論則數，例如 123"
              className={INPUT_CLASS}
            />
          </div>
          <input
            name="google_review_url"
            type="url"
            defaultValue={tenant.google_review_url ?? ""}
            placeholder="Google 評論頁網址（顧客點了會跳去看完整評論）"
            className={INPUT_CLASS + " mt-2.5"}
          />
          <p className="mt-1 text-xs text-neutral-400">
            選填。去 Google 商家後台看目前的星等跟評論則數，手動填在這裡就好——不是即時串接 Google
            自動抓取，安安自己三不五時更新一下數字即可。三個欄位都填了才會在顧客看車頁顯示星等徽章。
          </p>
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
            disabled={pending || logoCompressing}
            className="rounded-lg bg-[#BFA074] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "儲存中…" : logoCompressing ? "圖片處理中…" : "儲存變更"}
          </button>
        </div>
      </form>

      {/* 影音專區獨立在主表單外面——新增/刪除影片是各自獨立生效的動作，
          不是「改欄位、按儲存變更才生效」，混在同一個表單裡容易讓人誤會
          要按下面的「儲存變更」才算數。 */}
      <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <VideoSettingsSection initialVideos={tenantVideos} />
      </div>

      {/* 品牌簡介首圖橫幅相簿同樣獨立在主表單外面——新增/刪除各自獨立
          生效，跟影音專區、精選評論小卡同一個道理，排版也比照
          TenantReviewsModule（自己就是一個 section，不用額外包卡片外框）。
          放在最前面是因為這是顧客第一眼看到的東西，安安比較常會想調整。 */}
      <TenantHeroPhotosModule tenantId={tenant.id} />

      {/* 精選評論小卡同樣獨立在主表單外面——新增/刪除各自獨立生效，不是
          「改完要按上面的儲存變更」，跟影音專區同一個道理。 */}
      <TenantReviewsModule tenantId={tenant.id} />
    </section>
  );
}
