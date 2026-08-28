"use client";

import { useActionState, useEffect, useState } from "react";
import { createCar, updateCar, type CarFormState } from "../cars-actions";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";
import { useImageCompressOnChange } from "./use-image-compress-on-change";
import { VALID_BODY_TYPES } from "@/lib/supabase/types";
import type { Car, CarStatus, PaymentMethod, TransferStatus } from "@/lib/supabase/types";

const STATUS_OPTIONS: { value: CarStatus; label: string }[] = [
  { value: "preparing", label: "整備中" },
  { value: "in_stock", label: "待售中" },
  { value: "reserved", label: "已預訂" },
  { value: "sold", label: "已售出" },
];

// 常用廠牌，用 <datalist> 讓輸入框同時支援自由輸入跟下拉選取。
const COMMON_BRANDS = [
  "Mercedes-Benz",
  "BMW",
  "Toyota",
  "Honda",
  "Nissan",
  "Lexus",
  "Audi",
  "Volkswagen",
  "Mazda",
  "Hyundai",
  "Ford",
  "Volvo",
];

const CERTIFICATION_OPTIONS = ["GOO認證", "日本第三方認證", "萊茵檢驗", "原廠認證", "未認證"];

const TRANSMISSION_OPTIONS = ["手自排", "自排", "手排", "CVT 無段變速"];

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "匯款" },
  { value: "debt_settlement", label: "客戶代結清" },
  { value: "cash", label: "現金" },
];

const TRANSFER_STATUS_OPTIONS: TransferStatus[] = ["待辦", "辦理中", "已完成"];

const INSPECTION_AGENCY_OPTIONS = ["GOO", "SAVE"];

const initialState: CarFormState = {};

export function CarFormModal({
  mode,
  car,
  canViewCost,
  staff,
  onClose,
}: {
  mode: "create" | "edit";
  car?: Car;
  /**
   * 收購進價/過戶費/整理美容/整備維修/底價/最終成交價都是敏感成本資訊，
   * 沒有這個權限的人整個「成本與底價」區塊都看不到、也不能填——如果是
   * 編輯模式，改用隱藏欄位把原本的值原封不動送回去，不會因為這個人編輯
   * 了其他欄位就把既有成本資料清空或蓋成 0。展示開價（要跟客戶報價用）
   * 不算敏感資訊，一律顯示。
   */
  canViewCost: boolean;
  /** 「採購業務」下拉選單用——同車行的員工清單。 */
  staff: { id: string; name: string | null }[];
  /**
   * 存檔成功時呼叫；如果車輛本身存成功、但照片上傳失敗，會帶一句
   * warning 訊息上去，讓外層（CarsManager）用 Toast 顯示——不能因為
   * Modal 關閉了就讓這個警告完全消失、使用者永遠不知道照片沒傳成功。
   */
  onClose: (warning?: string) => void;
}) {
  const action = mode === "create" ? createCar : updateCar;
  const [state, formAction, pending] = useActionState(action, initialState);
  const { onChange: onPhotoChange, compressing: photoCompressing } = useImageCompressOnChange();
  const { markDirty, requestClose } = useUnsavedChangesGuard(() => onClose());

  // 新增/更新成功後自動關閉彈窗；cars-actions.ts 已經呼叫
  // revalidatePath("/dashboard")，所以關閉當下背後的表格資料已經是最新的，
  // 不需要整頁重新整理。這裡直接呼叫 onClose()、不走 requestClose()，
  // 存檔成功不需要再問一次「確定要離開嗎」。
  useEffect(() => {
    if (state?.success) {
      onClose(state.warning);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    // 背景（Backdrop）刻意不綁 onClick —— 點擊視窗外的空白處不會關閉，
    // 避免填到一半的表單資料被誤觸清掉。唯一的關閉方式是 ✕／取消按鈕，
    // 兩者都走 requestClose()，有異動過的話會先跳出確認提示。
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4 py-8">
      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-800">
            {mode === "create" ? "新增車輛" : "編輯車輛"}
          </h3>
          <button
            type="button"
            onClick={requestClose}
            aria-label="關閉"
            className="text-neutral-400 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        <form action={formAction} onChange={markDirty} className="mt-4 space-y-6">
          {mode === "edit" && car && (
            <input type="hidden" name="id" value={car.id} />
          )}

          {/* 基本規格 */}
          <FormSection title="基本規格">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="廠牌"
                name="brand"
                defaultValue={car?.brand ?? ""}
                list="brand-options"
                placeholder="例如：Toyota"
              />
              <Field
                label="車型名稱"
                name="model_name"
                defaultValue={car?.model_name ?? ""}
                placeholder="例如：Camry 2.5 豪華版"
                required
              />
            </div>
            <datalist id="brand-options">
              {COMMON_BRANDS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="出廠年份" name="year" type="number" defaultValue={car?.year?.toString() ?? ""} placeholder="2022" />
              <Field label="領牌年份" name="license_year" type="number" defaultValue={car?.license_year?.toString() ?? ""} placeholder="2022" />
              <Field label="里程數 (km)" name="mileage" type="number" defaultValue={car?.mileage?.toString() ?? ""} placeholder="18500" />
              <Field label="排氣量 (cc)" name="engine_cc" type="number" defaultValue={car?.engine_cc?.toString() ?? ""} placeholder="1998" />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field
                label="傳動/變速箱"
                name="transmission"
                defaultValue={car?.transmission ?? ""}
                list="transmission-options"
                placeholder="選擇或自行輸入"
              />
              <Field label="車色" name="color" defaultValue={car?.color ?? ""} placeholder="白色" />
              <Field label="車牌號碼" name="license_plate" defaultValue={car?.license_plate ?? ""} placeholder="ABC-1234" />
            </div>
            <datalist id="transmission-options">
              {TRANSMISSION_OPTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>

            <div className="mt-3">
              <Field label="VIN 車身號碼" name="vin" defaultValue={car?.vin ?? ""} />
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium text-neutral-700">車輛照片</label>
              <input
                type="file"
                name="photo"
                accept="image/*"
                onChange={onPhotoChange}
                className="mt-1 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#BFA074] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#AD9066]"
              />
              {photoCompressing && (
                <p className="mt-1 text-xs text-neutral-400">圖片壓縮中…</p>
              )}
              {car?.image_url && (
                <p className="mt-1 text-xs text-neutral-400">
                  已有照片，重新選擇檔案即可更換；不選則維持原照片。
                </p>
              )}
            </div>
          </FormSection>

          {/* 車況與認證 */}
          <FormSection title="車況與認證">
            <div>
              <label className="block text-sm font-medium text-neutral-700">認證狀態</label>
              <input
                name="certification"
                defaultValue={car?.certification ?? ""}
                list="certification-options"
                placeholder="選擇或自行輸入"
                className={INPUT_CLASS + " mt-1"}
              />
              <datalist id="certification-options">
                {CERTIFICATION_OPTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div className="mt-3">
              <Field
                label="出廠配備清單（用逗號分隔）"
                name="equipment_tags"
                defaultValue={car?.equipment_tags ?? ""}
                placeholder="電動座椅, 倒車雷達, 環景鏡頭"
              />
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium text-neutral-700">車況備註與整理重點</label>
              <textarea
                name="condition_notes"
                defaultValue={car?.condition_notes ?? ""}
                rows={3}
                placeholder="例如：已更換前輪胎組、原鈑件無事故"
                className={INPUT_CLASS + " mt-1 resize-y"}
              />
            </div>
          </FormSection>

          {/* 定價：把「展示開價／預計底價／最終成交價」這三個都是『賣多少
              錢』概念的欄位統整放在同一個區塊——原本最終成交價被放在下面
              「成本與底價」區塊裡，跟收購進價/過戶費/整理美容/整備維修這些
              『花了多少錢』的成本欄位混在一起，上架填表單時容易搞混、也不
              好找。展示開價本身不算敏感成本資訊，一律顯示、任何有編輯權限
              的人都能填；預計底價／最終成交價才是敏感財務數字，一樣只有
              canViewCost 才看得到、填得到，邏輯跟原本完全一樣，只是移到
              同一個「定價」區塊裡跟展示開價放在一起，不是分成兩個地方。 */}
          <FormSection title="定價（新台幣 NT$）">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field
                label="展示開價"
                name="selling_price"
                type="number"
                defaultValue={car?.selling_price != null ? String(car.selling_price) : ""}
              />
              {canViewCost ? (
                <>
                  <Field
                    label="預計底價"
                    name="floor_price"
                    type="number"
                    defaultValue={car?.floor_price != null ? String(car.floor_price) : ""}
                  />
                  <Field
                    label="最終成交價"
                    name="final_price"
                    type="number"
                    defaultValue={car?.final_price != null ? String(car.final_price) : ""}
                  />
                </>
              ) : (
                <>
                  <input type="hidden" name="floor_price" value={car?.floor_price ?? ""} />
                  <input type="hidden" name="final_price" value={car?.final_price ?? ""} />
                </>
              )}
            </div>
            {!canViewCost && (
              <p className="mt-2 text-xs text-neutral-400">
                🔒 預計底價／最終成交價屬於敏感財務資訊，沒有檢視權限
              </p>
            )}
          </FormSection>

          {/* 成本：純粹是「花了多少錢」的支出欄位，敏感財務資訊，沒有
              canViewCost 權限就整區隱藏、改用隱藏欄位把既有值原封不動送
              回去（新增模式沒有既有值可以保留，purchase_price 用 0 當
              預設，等有權限的人再回頭補上）。
              「整備維修成本」「整理美容成本」都不再是這裡手動填的欄位——
              這兩個數字現在改成從「維修請款與會計」分頁的請款紀錄依類別
              自動加總（見 car-detail-modal.tsx），新增請款時選哪台車、
              選哪個類別，對應車輛的成本就會自動更新，不用兩邊分別維護、
              也不會兜不起來。repair_cost / detailing_cost 這兩個舊欄位
              還在資料庫裡（保留既有資料，不主動清空），但表單不再讓人
              編輯，避免使用者以為填這裡有用。 */}
          {canViewCost ? (
            <FormSection title="成本（新台幣 NT$）">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field
                  label="收購進價"
                  name="purchase_price"
                  type="number"
                  defaultValue={car?.purchase_price != null ? String(car.purchase_price) : "0"}
                  required
                />
                <Field label="過戶費/規費" name="transfer_fee" type="number" defaultValue={car?.transfer_fee != null ? String(car.transfer_fee) : ""} />
                <Field
                  label="稅金/發票稅金"
                  name="tax_amount"
                  type="number"
                  defaultValue={car?.tax_amount != null ? String(car.tax_amount) : ""}
                  placeholder="每台車稅率不同，請自行填實際金額"
                />
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                整備維修成本／整理美容成本改到車輛詳情頁的「維修請款與會計」分頁新增請款（選對類別），會自動加總更新，這裡不用手動填。稅金因車輛/牌照類型而異，系統不自動計算，請自行填寫實際金額。
              </p>
              <input type="hidden" name="repair_cost" value={car?.repair_cost ?? ""} />
              <input type="hidden" name="detailing_cost" value={car?.detailing_cost ?? ""} />
            </FormSection>
          ) : (
            <>
              <p className="text-xs text-neutral-400">🔒 成本屬於敏感財務資訊，沒有檢視權限</p>
              <input type="hidden" name="purchase_price" value={car?.purchase_price ?? 0} />
              <input type="hidden" name="transfer_fee" value={car?.transfer_fee ?? ""} />
              <input type="hidden" name="tax_amount" value={car?.tax_amount ?? ""} />
              <input type="hidden" name="detailing_cost" value={car?.detailing_cost ?? ""} />
              <input type="hidden" name="repair_cost" value={car?.repair_cost ?? ""} />
            </>
          )}

          {/* 進貨付款追蹤：跟成本一樣算敏感財務資訊，同一套 canViewCost
              權限控管，理由跟做法都跟上面「成本與底價」區塊一致。 */}
          {canViewCost ? (
            <Accordion
              title="進貨付款追蹤"
              defaultOpen={!!car?.paid_amount || !!car?.payment_method || !!car?.purchased_by}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field
                  label="已付金額"
                  name="paid_amount"
                  type="number"
                  defaultValue={car?.paid_amount != null ? String(car.paid_amount) : ""}
                />
                <div>
                  <label className="block text-sm font-medium text-neutral-700">付款方式</label>
                  <select
                    name="payment_method"
                    defaultValue={car?.payment_method ?? ""}
                    className={INPUT_CLASS + " mt-1"}
                  >
                    <option value="">未指定</option>
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">採購業務</label>
                  <select
                    name="purchased_by"
                    defaultValue={car?.purchased_by ?? ""}
                    className={INPUT_CLASS + " mt-1"}
                  >
                    <option value="">未指定</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name ?? "未命名"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-neutral-700">付款備註</label>
                <textarea
                  name="payment_note"
                  defaultValue={car?.payment_note ?? ""}
                  rows={2}
                  className={INPUT_CLASS + " mt-1 resize-y"}
                />
              </div>
            </Accordion>
          ) : (
            <>
              <input type="hidden" name="paid_amount" value={car?.paid_amount ?? ""} />
              <input type="hidden" name="payment_method" value={car?.payment_method ?? ""} />
              <input type="hidden" name="payment_note" value={car?.payment_note ?? ""} />
              <input type="hidden" name="purchased_by" value={car?.purchased_by ?? ""} />
            </>
          )}

          {/* 行政過戶與第三方認證：操作性/行政進度追蹤，不算敏感財務資訊，
              任何有 canEditCars 權限的人（本來就能開這個表單）都看得到。 */}
          <Accordion
            title="行政與認證"
            defaultOpen={!!car?.transfer_date || !!car?.inspection_agency}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="預定過戶日期" name="transfer_date" type="date" defaultValue={car?.transfer_date ?? ""} />
              <div>
                <label className="block text-sm font-medium text-neutral-700">過戶狀態</label>
                <select
                  name="transfer_status"
                  defaultValue={car?.transfer_status ?? ""}
                  className={INPUT_CLASS + " mt-1"}
                >
                  <option value="">未指定</option>
                  {TRANSFER_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700">認證機構</label>
                <input
                  name="inspection_agency"
                  defaultValue={car?.inspection_agency ?? ""}
                  list="inspection-agency-options"
                  placeholder="選擇或自行輸入"
                  className={INPUT_CLASS + " mt-1"}
                />
                <datalist id="inspection-agency-options">
                  {INSPECTION_AGENCY_OPTIONS.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>
              <Field label="預約認證日期" name="inspection_date" type="date" defaultValue={car?.inspection_date ?? ""} />
              <Field label="認證狀態/結果" name="inspection_status" defaultValue={car?.inspection_status ?? ""} />
            </div>
          </Accordion>

          {/* 二胎／人頭車合作紀錄：跟成本一樣算敏感財務資訊，同一套
              canViewCost 權限控管。has_used_as_nominee 是永久旗標——一旦
              標記過，這四個欄位在畫面上就整組鎖住（disabled），伺服器端
              （cars-actions.ts 的 computeNomineeFields）也會無條件忽略
              這幾個欄位送上來的值，雙重防呆，不會被繞過。 */}
          {canViewCost ? (
            <Accordion
              title="二胎／人頭車合作紀錄"
              defaultOpen={car?.has_used_as_nominee || !!car?.nominee_company}
              badge={
                car?.has_used_as_nominee ? (
                  <span className="inline-flex items-center rounded-full bg-[#FBEAEA] px-2 py-0.5 text-[11px] font-semibold text-[#B75454] ring-1 ring-inset ring-[#F0D3D3]">
                    ⚠️ 已使用過人頭 (不可再使用)
                  </span>
                ) : undefined
              }
            >
              {car?.has_used_as_nominee && (
                <p className="mb-3 rounded-lg bg-[#FBEAEA] px-3 py-2 text-xs text-[#B75454]">
                  這輛車已經登記過人頭紀錄，資料一經標記即永久鎖定，無法修改或重新登記。
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field
                  label="二胎公司名稱"
                  name="nominee_company"
                  defaultValue={car?.nominee_company ?? ""}
                  disabled={car?.has_used_as_nominee}
                />
                <Field
                  label="人頭天數"
                  name="nominee_days"
                  defaultValue={car?.nominee_days ?? ""}
                  disabled={car?.has_used_as_nominee}
                />
                <Field
                  label="人頭開始日期"
                  name="nominee_start_date"
                  type="date"
                  defaultValue={car?.nominee_start_date ?? ""}
                  disabled={car?.has_used_as_nominee}
                />
                <Field
                  label="證件預計/實際回收日期"
                  name="id_return_date"
                  type="date"
                  defaultValue={car?.id_return_date ?? ""}
                  disabled={car?.has_used_as_nominee}
                />
              </div>
              {!car?.has_used_as_nominee && (
                <p className="mt-2 text-xs text-neutral-400">
                  填寫並儲存以上任一欄位後，系統會將這輛車永久標記為「已使用過人頭」。
                </p>
              )}
            </Accordion>
          ) : (
            <>
              <input type="hidden" name="nominee_company" value={car?.nominee_company ?? ""} />
              <input type="hidden" name="nominee_days" value={car?.nominee_days ?? ""} />
              <input type="hidden" name="nominee_start_date" value={car?.nominee_start_date ?? ""} />
              <input type="hidden" name="id_return_date" value={car?.id_return_date ?? ""} />
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="status"
                className="block text-sm font-medium text-neutral-700"
              >
                車輛狀態
              </label>
              <select
                id="status"
                name="status"
                defaultValue={car?.status ?? "in_stock"}
                className={INPUT_CLASS + " mt-1"}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {/* 車型分類——給前台展間頁上方的分類選單用（小型車/房車/休旅車/
                  跑車/商用車），選填，沒選就是「未分類」，展間分類選單裡
                  不會出現這台車，但車輛本身還是照常顯示在「全部車輛」。 */}
              <label
                htmlFor="body_type"
                className="block text-sm font-medium text-neutral-700"
              >
                車型分類
              </label>
              <select
                id="body_type"
                name="body_type"
                defaultValue={car?.body_type ?? ""}
                className={INPUT_CLASS + " mt-1"}
              >
                <option value="">未分類</option>
                {VALID_BODY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  name="is_public"
                  defaultChecked={car?.is_public ?? true}
                  className="h-4 w-4 rounded border-neutral-300 text-[#BFA074] focus:ring-[#BFA074]"
                />
                於前台看車頁公開顯示
              </label>
            </div>
            <div className="flex items-end pb-2">
              {/* 熱門推薦——後台手動開關，是不是「熱門款」由車行自己判斷、
                  自己決定，不是系統自動算出來的，見 cars-actions.ts 對
                  VALID_BODY_TYPES 附近的說明。 */}
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  name="is_featured"
                  defaultChecked={car?.is_featured ?? false}
                  className="h-4 w-4 rounded border-neutral-300 text-[#BFA074] focus:ring-[#BFA074]"
                />
                設為熱門推薦（於展間頁「熱門款」分類顯示）
              </label>
            </div>
            <div className="flex items-end pb-2">
              {/* 大圖卡——2026-08 新增，使用者明確要求「現有車輛」頁哪些
                  車要用大圖廣告卡、哪些用小圖，要能自己設定，不要系統
                  自動判斷（原本是自動挑排序第一台放大）。跟上面「熱門
                  推薦」是各自獨立的開關，互不影響，可以同時勾選、也可以
                  只勾其中一個。勾了這個的車輛，會在「現有車輛」頁車輛
                  清單裡用大圖卡呈現；如果同時是這個車行第一台被勾選的
                  車，也會顯示在頁面最上面的「焦點車款」大圖，見
                  showroom-cars-section.tsx 的說明。 */}
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  name="is_large_card"
                  defaultChecked={car?.is_large_card ?? false}
                  className="h-4 w-4 rounded border-neutral-300 text-[#BFA074] focus:ring-[#BFA074]"
                />
                設為大圖卡（於「現有車輛」頁以大圖廣告卡呈現）
              </label>
            </div>
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
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending || photoCompressing}
              className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "儲存中…" : photoCompressing ? "圖片處理中…" : "儲存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * 折疊區塊：進貨付款追蹤／行政與認證／二胎人頭車紀錄都是「不一定每次都
 * 要填」的次要資訊，用 Accordion 收起來，預設依有沒有既有資料決定要不要
 * 自動展開（defaultOpen），避免每次開表單都要看一長串很少用到的欄位。
 * 是純前端 UI 狀態，跟表單送出的資料完全無關——收起來的區塊裡的 input
 * 還是掛在 DOM 上（只是用 CSS 隱藏，不是拿掉），照樣會被送出。
 */
function Accordion({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {title}
          {badge}
        </span>
        <span
          aria-hidden
          className={"text-neutral-400 transition-transform " + (open ? "rotate-180" : "")}
        >
          ⌄
        </span>
      </button>
      <div className={open ? "border-t border-neutral-100 p-3" : "hidden"}>{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required = false,
  disabled = false,
  list,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  list?: string;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-neutral-700"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        list={list}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        className={INPUT_CLASS + " mt-1 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"}
      />
    </div>
  );
}
