"use client";

// 「發票」——2026-09-07 新增。安安手開發票時需要一次看到完整的資料鏈：
// 這台車什麼時候入庫、從誰的名下過戶收購進來（姓名＋身分證字號）、進貨
// 花了多少錢，到後來公司開票賣給誰（姓名/電話/統編/身分證字號）、賣了
// 多少錢。跟「單台車結算報表」讀同一批 cars 資料，但這裡不是淨利分析，
// 不重複做那邊的成本拆解／淨利計算，只列開發票真正需要的欄位，一台已
// 售出車輛一列。
//
// 2026-09-07 第二次追加：安安反映這幾個欄位（賣家身分證字號／買方身分
// 證字號）要能直接在這個畫面編輯，不用跳去「車輛管理」或「買賣合約」
// 分開改。每一列多一個「✏️ 編輯」按鈕，展開後是兩個獨立的小表單：
// 「賣家資訊」直接寫回 cars 表（呼叫 updateCarSellerInfo()），「買方
// 資訊」直接寫回 deals 表（呼叫 updateDealBuyerInfo()）——這兩支都是
// 專門給這個畫面用的輕量級動作，只改這幾個欄位，不會動到車輛/合約的
// 其他資料（收購進價、成交價、合約狀態等一律不受影響）。
//
// 2026-09-07 第三次追加：安安反映賣家資訊也要跟買方一樣有「統一編號」
// （跟公司行號收購車輛時填，seller_tax_id，對稱 deals.buyer_tax_id），
// 跟身分證字號並存互斥——現在賣家/買方兩邊的欄位結構完全對稱：姓名／
// 統一編號（公司）／身分證字號（個人）。
//
// 買方資訊存在 deals 表（customer_name/customer_phone/buyer_tax_id/
// buyer_id_number），car 本身沒有買方資訊，這裡用 car_id 對應狀態是
// delivered 的合約——一台已售出（status === "sold"）的車理論上只會有
// 一張 delivered 合約（同一台車不會被重複開約，見 deal-form-modal.tsx
// 「已成交的車輛不會出現在新增合約清單」的說明），萬一找不到對應合約
// （不該發生，保險起見）就顯示「—」，也不會出現「買方資訊」編輯表單。
//
// 底下嵌入 Simpany 提供的「手開發票小幫手」（外部免費工具，計算三聯式/
// 二聯式發票稅額），安安要求直接放在這個畫面最下面，不用切出去另開
// 分頁查。
import { Fragment, useMemo, useState, type FormEvent } from "react";
import type { Car, Deal } from "@/lib/supabase/types";
import { formatCurrency, formatDate, currentTaiwanDateKey } from "@/lib/format";
import { downloadCsv } from "@/lib/csv-export";
import { type DateRangePreset, resolveRange, isInRange } from "@/lib/report-date-range";
import { DateRangeFilter } from "./reports/date-range-filter";
import { updateCarSellerInfo } from "../cars-actions";
import { updateDealBuyerInfo } from "../deals-actions";

const SMALL_INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

export function InvoiceModule({ cars, deals }: { cars: Car[]; deals: Deal[] }) {
  // 預設「全部」——這裡是查閱用的對照清單（要開哪一張發票、核對某台舊車
  // 當初賣給誰），不是像其他報表那樣以「本月」分析績效為主，所以預設攤開
  // 全部歷史紀錄，要縮小範圍再自己切換。
  const [preset, setPreset] = useState<DateRangePreset>("all");
  const [customStart, setCustomStart] = useState(() => currentTaiwanDateKey());
  const [customEnd, setCustomEnd] = useState(() => currentTaiwanDateKey());
  const range = resolveRange(preset, customStart, customEnd);
  // 目前展開編輯的是哪一台車，一次只開一列，避免同時開很多個表單。
  const [editingCarId, setEditingCarId] = useState<string | null>(null);

  const dealByCarId = useMemo(() => {
    const map = new Map<string, Deal>();
    for (const d of deals) {
      if (d.status === "delivered") map.set(d.car_id, d);
    }
    return map;
  }, [deals]);

  const rows = useMemo(() => {
    return cars
      .filter((c) => c.status === "sold" && c.closed_at && isInRange(c.closed_at, range))
      .map((c) => ({ car: c, deal: dealByCarId.get(c.id) ?? null }))
      .sort((a, b) => (a.car.closed_at! < b.car.closed_at! ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, dealByCarId, range.start, range.end]);

  function handleExport() {
    const header = [
      "入庫日期",
      "車輛",
      "車牌",
      "過戶來源（賣家）",
      "賣家電話",
      "賣家身分證字號",
      "賣家統一編號",
      "進貨金額",
      "售出日期",
      "售出金額",
      "買方",
      "買方電話",
      "買方統一編號",
      "買方身分證字號",
    ];
    const dataRows = rows.map(({ car, deal }) => [
      car.created_at?.slice(0, 10) ?? "",
      `${car.brand ?? ""} ${car.model_name}`.trim(),
      car.license_plate ?? "",
      car.seller_name ?? "",
      car.seller_phone ?? "",
      car.seller_id_number ?? "",
      car.seller_tax_id ?? "",
      car.purchase_price,
      car.closed_at?.slice(0, 10) ?? "",
      car.final_price ?? 0,
      deal?.customer_name ?? "",
      deal?.customer_phone ?? "",
      deal?.buyer_tax_id ?? "",
      deal?.buyer_id_number ?? "",
    ]);
    downloadCsv(`發票資料-${currentTaiwanDateKey()}.csv`, header, dataRows);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <p>
          這裡列出每一台已售出車輛「開發票」需要的完整資料鏈：入庫時間、從誰過戶收購進來（姓名／身分證字號）、進貨花了多少錢，到後來公司開票賣給誰（姓名／電話／統編／身分證字號）、賣了多少錢。點每一列的「✏️ 編輯」可以直接在這裡修改賣家與買方資訊，不用跳去「車輛管理」或「買賣合約」。底下附上「手開發票小幫手」試算小工具，幫忙算三聯式/二聯式發票的稅額。
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateRangeFilter
          preset={preset}
          onPresetChange={setPreset}
          customStart={customStart}
          onCustomStartChange={setCustomStart}
          customEnd={customEnd}
          onCustomEndChange={setCustomEnd}
        />
        <button
          type="button"
          onClick={handleExport}
          disabled={rows.length === 0}
          className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⬇️ 匯出 CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">入庫日期</th>
              <th className="px-4 py-2 font-medium">車輛</th>
              <th className="px-4 py-2 font-medium">過戶來源（賣家）</th>
              <th className="px-4 py-2 font-medium">賣家電話</th>
              <th className="px-4 py-2 font-medium">賣家身分證字號</th>
              <th className="px-4 py-2 font-medium">賣家統編</th>
              <th className="px-4 py-2 text-right font-medium">進貨金額</th>
              <th className="px-4 py-2 font-medium">售出日期</th>
              <th className="px-4 py-2 text-right font-medium">售出金額</th>
              <th className="px-4 py-2 font-medium">買方</th>
              <th className="px-4 py-2 font-medium">買方電話</th>
              <th className="px-4 py-2 font-medium">買方統編</th>
              <th className="px-4 py-2 font-medium">買方身分證字號</th>
              <th className="px-4 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-neutral-400">
                  這段期間沒有已售出車輛
                </td>
              </tr>
            )}
            {rows.map(({ car, deal }) => {
              const isEditing = editingCarId === car.id;
              return (
                <Fragment key={car.id}>
                  <tr className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-500">{formatDate(car.created_at)}</td>
                    <td className="px-4 py-2 text-neutral-800">
                      {car.brand ? `${car.brand} ` : ""}
                      {car.model_name}
                      {car.license_plate && <span className="ml-1.5 text-xs text-neutral-400">{car.license_plate}</span>}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">{car.seller_name || "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{car.seller_phone || "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{car.seller_id_number || "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{car.seller_tax_id || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-600">{formatCurrency(car.purchase_price)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-500">{formatDate(car.closed_at)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-neutral-800">
                      {formatCurrency(car.final_price ?? 0)}
                    </td>
                    <td className="px-4 py-2 text-neutral-800">{deal?.customer_name || "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{deal?.customer_phone || "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{deal?.buyer_tax_id || "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{deal?.buyer_id_number || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setEditingCarId(isEditing ? null : car.id)}
                        className="rounded-lg border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-600 hover:border-blue-300 hover:text-blue-700"
                      >
                        {isEditing ? "收起" : "✏️ 編輯"}
                      </button>
                    </td>
                  </tr>
                  {isEditing && (
                    <tr className="bg-neutral-50">
                      <td colSpan={13} className="px-4 py-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <SellerInfoForm car={car} />
                          {deal ? (
                            <BuyerInfoForm deal={deal} />
                          ) : (
                            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-xs text-neutral-400">
                              找不到這台車對應的合約，買方資訊無法編輯——理論上不該發生，如果看到這個訊息請跟我說。
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 2026-09-07 新增：安安要求嵌入 Simpany 的「手開發票小幫手」
          （https://simpany.co/invoice-helper）——輸入統編/抬頭跟銷售金額
          自動算稅額、附發票開法教學，直接嵌在這個分頁下方，不用另外切換
          分頁/開新分頁查。畫面刻意設定得比較小（安安確認「畫面小一點沒
          關係」）。這是第三方網站，安全性設定不受我們控制，如果對方之後
          改了政策擋掉 iframe 嵌入，下面會顯示空白區塊，這時候用旁邊
          「開新分頁」連結一樣打得開。 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-800">🧮 手開發票小幫手（試算稅額）</h3>
          <a
            href="https://simpany.co/invoice-helper"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            開新分頁 ↗
          </a>
        </div>
        <iframe
          src="https://simpany.co/invoice-helper"
          title="手開發票小幫手"
          className="w-full rounded-xl border border-neutral-200"
          style={{ height: 520 }}
        />
        <p className="mt-2 text-[11px] text-neutral-400">
          這是 Simpany 提供的外部免費工具，如果下面顯示空白，代表對方網站暫時不允許嵌入，改用上面「開新分頁」連結開啟即可。
        </p>
      </div>
    </div>
  );
}

/** 賣家資訊（收購來源）——直接寫回 cars 表的 seller_name／seller_phone／
 * seller_id_number／seller_tax_id 這四欄，見 cars-actions.ts 的
 * updateCarSellerInfo()。統一編號跟身分證字號並存互斥（公司行號收購
 * 填統編、跟個人收購填身分證字號，通常不會兩個都填），跟「買方資訊」
 * 表單的姓名/電話/統編/身分證字號同一個道理，欄位排法也對齊。不影響
 * 車輛的其他資料（收購進價、底價等），存檔後 revalidatePath 會讓整頁
 * 資料重新整理，這個小表單自己只需要顯示「已儲存」的提示。 */
function SellerInfoForm({ car }: { car: Car }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result = await updateCarSellerInfo(car.id, formData);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-xs font-semibold text-neutral-600">賣家資訊（收購來源）</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-neutral-500">姓名</label>
          <input name="seller_name" defaultValue={car.seller_name ?? ""} className={SMALL_INPUT_CLASS} />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-neutral-500">電話</label>
          <input name="seller_phone" defaultValue={car.seller_phone ?? ""} className={SMALL_INPUT_CLASS} />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-neutral-500">統一編號（公司行號）</label>
          <input name="seller_tax_id" defaultValue={car.seller_tax_id ?? ""} className={SMALL_INPUT_CLASS} />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-neutral-500">身分證字號（個人）</label>
          <input name="seller_id_number" defaultValue={car.seller_id_number ?? ""} className={SMALL_INPUT_CLASS} />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "儲存中…" : "儲存賣家資訊"}
        </button>
        {saved && <span className="text-xs font-medium text-emerald-600">已儲存 ✓</span>}
      </div>
    </form>
  );
}

/** 買方資訊——直接寫回 deals 表的 customer_name／customer_phone／
 * buyer_tax_id／buyer_id_number 這四欄，見 deals-actions.ts 的
 * updateDealBuyerInfo()。不影響合約本身的成交價/狀態/抽成等資料。 */
function BuyerInfoForm({ deal }: { deal: Deal }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result = await updateDealBuyerInfo(deal.id, formData);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-xs font-semibold text-neutral-600">買方資訊</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-neutral-500">姓名</label>
          <input name="customer_name" defaultValue={deal.customer_name} required className={SMALL_INPUT_CLASS} />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-neutral-500">電話</label>
          <input name="customer_phone" defaultValue={deal.customer_phone ?? ""} className={SMALL_INPUT_CLASS} />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-neutral-500">統一編號（公司行號）</label>
          <input name="buyer_tax_id" defaultValue={deal.buyer_tax_id ?? ""} className={SMALL_INPUT_CLASS} />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-neutral-500">身分證字號（賣給個人）</label>
          <input name="buyer_id_number" defaultValue={deal.buyer_id_number ?? ""} className={SMALL_INPUT_CLASS} />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "儲存中…" : "儲存買方資訊"}
        </button>
        {saved && <span className="text-xs font-medium text-emerald-600">已儲存 ✓</span>}
      </div>
    </form>
  );
}
