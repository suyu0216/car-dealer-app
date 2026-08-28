"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { Car, RepairItem, RepairItemCategory, RepairItemStatus, Role } from "@/lib/supabase/types";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  createRepairItem,
  reviewRepairItem,
  type RepairItemFormState,
} from "../repair-items-actions";
import { REPAIR_ITEM_CATEGORIES } from "@/lib/repair-item-constants";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

export const REPAIR_STATUS_LABEL: Record<RepairItemStatus, string> = {
  pending: "待會計審核",
  approved: "會計已撥款",
  rejected: "已退回",
};

// 韓系柔和色系：待審核＝柔和橘黃、已撥款＝莫蘭迪綠、已退回＝柔和玫瑰紅。
export const REPAIR_STATUS_STYLE: Record<RepairItemStatus, string> = {
  pending: "bg-[#FBF1E4] text-[#B4813E] ring-[#F0DFC0]",
  approved: "bg-[#EEF2ED] text-[#5F7563] ring-[#D9E2D6]",
  rejected: "bg-[#FBEAEA] text-[#B75454] ring-[#F0D3D3]",
};

export const REPAIR_CATEGORY_ICON: Record<RepairItemCategory, string> = {
  維修: "🔧",
  美容: "✨",
  其他: "📎",
};

function totalCost(car: Car, approvedPrepCost: number) {
  return Number(car.purchase_price) + approvedPrepCost + Number(car.transfer_fee ?? 0);
}

export function CarMaintenanceTab({
  car,
  repairItems,
  role,
  canViewCost,
  receiptUrls,
  staff,
}: {
  car: Car;
  repairItems: RepairItem[];
  role: Role;
  /** 車輛財務損益卡（收購價/總成本/毛利）算敏感財務資訊，沒權限就整卡遮罩；
   * 底下的維修請款紀錄本身（金額、審核狀態）仍然照舊顯示——那是業務日常
   * 要送出/追蹤的請款流程，不是「進貨成本／總利潤」。 */
  canViewCost: boolean;
  /** evidence_path -> 伺服器簽發的短效期 signed URL（見 dashboard/page.tsx）。 */
  receiptUrls: Record<string, string>;
  /** 「墊款業務/經手人」下拉選單用——同車行的員工清單，新邀請的員工會
   * 自動出現在這裡，不用再手動打字。 */
  staff: { id: string; name: string | null }[];
}) {
  const canReview = role === "tenant_admin";

  // 車輛售出即結帳：car.closed_at 非 null 代表已經在售出當下把維修整備費
  // 封存過（見 cars-actions.ts 的 computeClosingFields()），這裡就顯示
  // 封存當時的數字，不再即時重新加總 repair_items —— 不然之後又核准了
  // 新的請款，已售出車輛的「已實現損益」會憑空跑掉。還沒結帳（在庫）的
  // 車輛才用即時加總。
  const isClosed = car.closed_at != null;
  const approvedItems = repairItems.filter((r) => r.status === "approved");
  const liveTotalPrepCost = approvedItems.reduce((sum, r) => sum + Number(r.amount), 0);
  const totalPrepCost = isClosed ? Number(car.closed_prep_cost ?? 0) : liveTotalPrepCost;
  const cost = isClosed ? Number(car.closed_total_cost ?? 0) : totalCost(car, liveTotalPrepCost);
  const revenueBasis = car.final_price ?? car.selling_price ?? null;
  const profit = revenueBasis != null ? revenueBasis - cost : null;

  return (
    <div className="space-y-6">
      {isClosed && (
        <p className="rounded-lg bg-[#EEF2ED] px-3 py-2 text-xs text-[#5F7563]">
          🔒 這輛車已於 {formatDate(car.closed_at)}{" "}
          結帳封存，以下成本數字是售出當下的快照，不會再隨新的維修請款變動。
        </p>
      )}
      {canViewCost ? (
        <VehiclePnlCard
          purchasePrice={car.purchase_price}
          prepCost={totalPrepCost}
          transferFee={car.transfer_fee}
          totalCost={cost}
          revenueBasis={revenueBasis}
          isFinalPrice={car.final_price != null}
          profit={profit}
        />
      ) : (
        <section className="rounded-2xl border border-neutral-200 bg-[#F8F9FA] p-4 text-center text-sm text-neutral-400">
          🔒 車輛財務損益屬於敏感資訊，沒有檢視權限
        </section>
      )}

      <RepairItemForm carId={car.id} staff={staff} />

      <RepairItemList items={repairItems} canReview={canReview} receiptUrls={receiptUrls} />
    </div>
  );
}

function VehiclePnlCard({
  purchasePrice,
  prepCost,
  transferFee,
  totalCost,
  revenueBasis,
  isFinalPrice,
  profit,
}: {
  purchasePrice: number;
  prepCost: number;
  transferFee: number | null;
  totalCost: number;
  revenueBasis: number | null;
  isFinalPrice: boolean;
  profit: number | null;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-[#F8F9FA] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        車輛財務損益
      </h3>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <CostChip label="收購價" value={purchasePrice} />
        <span className="text-neutral-300">+</span>
        <CostChip label="維修整備費" value={prepCost} />
        <span className="text-neutral-300">+</span>
        <CostChip label="規費" value={transferFee ?? 0} />
        <span className="text-neutral-300">=</span>
        <CostChip label="車輛總成本" value={totalCost} strong />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-200 pt-4">
        <div>
          <p className="text-[11px] text-neutral-400">
            {isFinalPrice ? "最終成交價" : "展示開價（預估）"}
          </p>
          <p className="mt-0.5 text-lg font-semibold text-neutral-800 tabular-nums">
            {revenueBasis != null ? formatCurrency(revenueBasis) : "尚未訂價"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-neutral-400">
            {isFinalPrice ? "實際淨利" : "預估毛利"}
          </p>
          <p
            className={
              "mt-0.5 text-lg font-semibold tabular-nums " +
              (profit == null
                ? "text-neutral-400"
                : profit >= 0
                  ? "text-[#5F7563]"
                  : "text-[#B75454]")
            }
          >
            {profit != null ? formatCurrency(profit) : "—"}
          </p>
        </div>
      </div>
    </section>
  );
}

function CostChip({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <span
      className={
        "inline-flex items-baseline gap-1.5 rounded-lg px-2.5 py-1 " +
        (strong ? "bg-[#BFA074]/15" : "bg-white ring-1 ring-inset ring-neutral-200")
      }
    >
      <span className="text-[11px] text-neutral-500">{label}</span>
      <span
        className={
          "font-medium tabular-nums " + (strong ? "text-[#A6793D]" : "text-neutral-700")
        }
      >
        {formatCurrency(value)}
      </span>
    </span>
  );
}

const formInitialState: RepairItemFormState = {};

function RepairItemForm({
  carId,
  staff,
}: {
  carId: string;
  staff: { id: string; name: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [state, formAction, pending] = useActionState(createRepairItem, formInitialState);
  // 這個表單不是全螢幕彈窗（沒有 backdrop），但一樣是「新增維修請款」
  // 這類容易漏填就被關掉的表單，「收起」跟「取消」都走同一套未存檔提示。
  const { markDirty, requestClose, resetDirty } = useUnsavedChangesGuard(() => setOpen(false));

  // 表單欄位是 uncontrolled input，送出成功後換一個 key 強制整個表單重新
  // 掛載，這樣欄位會清空、可以直接接著填下一筆，不用手動一格一格清掉。
  // 同時重置 dirty 狀態，不然上一筆已經送出的「有異動」痕跡會殘留，
  // 之後點「收起」會被誤判成還有未存檔內容。
  useEffect(() => {
    if (state?.success) {
      setResetKey((k) => k + 1);
      resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-500 transition hover:border-[#BFA074] hover:text-[#A6793D]"
      >
        + 新增維修請款
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          新增維修請款
        </h3>
        <button
          type="button"
          onClick={requestClose}
          className="text-xs text-neutral-400 hover:text-neutral-700"
        >
          收起
        </button>
      </div>

      <form key={resetKey} action={formAction} onChange={markDirty} className="mt-3 space-y-3">
        <input type="hidden" name="car_id" value={carId} />

        <div className="grid grid-cols-2 gap-3">
          <RepairField label="維修項目名稱" name="item_name" placeholder="例如：烤漆、換機油" required />
          <RepairField label="金額" name="amount" type="number" placeholder="0" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-neutral-700">
              類別
            </label>
            <select
              id="category"
              name="category"
              defaultValue="維修"
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none focus:border-[#BFA074] focus:bg-white"
            >
              {REPAIR_ITEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {REPAIR_CATEGORY_ICON[c]} {c}
                </option>
              ))}
            </select>
          </div>
          <RepairField label="廠商/保養廠名稱" name="vendor_name" placeholder="例如：三久烤漆廠" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <HandlerNameSelect staff={staff} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <RepairField label="單據號碼/發票號" name="receipt_number" />
          <div>
            <label htmlFor="receipt" className="block text-sm font-medium text-neutral-700">
              維修單據/發票
            </label>
            <input
              id="receipt"
              type="file"
              name="receipt"
              accept="image/*,application/pdf"
              className="mt-1 block w-full text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-[#BFA074] file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-[#AD9066]"
            />
          </div>
        </div>

        {state?.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="rounded-lg bg-[#EEF2ED] px-3 py-2 text-sm text-[#5F7563]">
            已送出，狀態為「待會計審核」。
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "送出中…" : "送出請款"}
          </button>
        </div>
      </form>
    </section>
  );
}

/**
 * 「墊款業務/經手人」下拉選單——原本是自由輸入文字，同一個人每次可能打
 * 法不一樣（「小明」「王小明」…），沒辦法真的統計「誰經手了多少筆」。
 * 改成從同車行的員工清單選，新邀請的員工會自動出現在這裡，不用另外
 * 手動維護一份名單。存的還是純文字（跟 repair_items.handler_name 欄位
 * 型別一致，不改資料庫），只是來源固定從員工清單選，不是手打——這裡故意
 * 不加「其他/手動輸入」的退路，維修請款與會計、維修模組匯出的分頁跨檔案
 * 匯出時共用這份清單，見 maintenance-module.tsx 也用到這個元件。
 */
export function HandlerNameSelect({
  staff,
  defaultValue,
}: {
  staff: { id: string; name: string | null }[];
  defaultValue?: string;
}) {
  const names = Array.from(new Set(staff.map((s) => s.name).filter((n): n is string => !!n))).sort(
    (a, b) => a.localeCompare(b)
  );

  return (
    <div>
      <label htmlFor="handler_name" className="block text-sm font-medium text-neutral-700">
        墊款業務/經手人
      </label>
      <select
        id="handler_name"
        name="handler_name"
        defaultValue={defaultValue ?? ""}
        className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none focus:border-[#BFA074] focus:bg-white"
      >
        <option value="">請選擇</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

function RepairField({
  label,
  name,
  type = "text",
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
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
        placeholder={placeholder}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white"
      />
    </div>
  );
}

function RepairItemList({
  items,
  canReview,
  receiptUrls,
}: {
  items: RepairItem[];
  canReview: boolean;
  receiptUrls: Record<string, string>;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">
        尚無維修請款紀錄
      </p>
    );
  }

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        維修請款紀錄
      </h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <RepairItemRow
            key={item.id}
            item={item}
            canReview={canReview}
            receiptUrl={item.evidence_path ? receiptUrls[item.evidence_path] : (item.evidence_url ?? undefined)}
          />
        ))}
      </ul>
    </section>
  );
}

export function RepairItemRow({
  item,
  canReview,
  receiptUrl,
  carLabel,
  highlighted,
}: {
  item: RepairItem;
  canReview: boolean;
  receiptUrl: string | undefined;
  /** 跨車輛列表（獨立維修模組）才需要顯示是哪一輛車，單一車輛的分頁裡不用。 */
  carLabel?: string;
  /** 從通知鈴鐺點進來、傳送門指到這一筆——加上錨點 id 讓頁面可以自動
   * 捲到這裡，並用外框反白幾秒，讓人一眼看到「就是這筆」。 */
  highlighted?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await reviewRepairItem(item.id, decision);
      setError(result?.error ?? null);
    });
  }

  return (
    <li
      id={`repair-item-${item.id}`}
      className={
        "rounded-xl border bg-white p-3 transition " +
        (highlighted ? "border-[#BFA074] ring-2 ring-[#BFA074] ring-offset-2" : "border-neutral-200")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {carLabel && (
            <p className="text-xs font-medium text-[#A6793D]">{carLabel}</p>
          )}
          <p className="text-sm font-medium text-neutral-800">
            <span aria-hidden className="mr-1">
              {REPAIR_CATEGORY_ICON[item.category] ?? "🔧"}
            </span>
            {item.item_name}
            <span className="ml-1.5 text-xs font-normal text-neutral-400">{item.category}</span>
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {[item.vendor_name, item.handler_name && `經手人：${item.handler_name}`]
              .filter(Boolean)
              .join(" ・ ") || "—"}
          </p>
          {item.receipt_number && (
            <p className="text-xs text-neutral-400">單據號碼：{item.receipt_number}</p>
          )}
          {receiptUrl && (
            <a
              href={receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#A6793D] underline-offset-2 hover:underline"
            >
              查看單據/發票
            </a>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-neutral-800 tabular-nums">
            {formatCurrency(item.amount)}
          </p>
          <span
            className={
              "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset " +
              REPAIR_STATUS_STYLE[item.status]
            }
          >
            {REPAIR_STATUS_LABEL[item.status]}
          </span>
        </div>
      </div>

      {canReview && item.status === "pending" && (
        <div className="mt-2 flex justify-end gap-2 border-t border-neutral-100 pt-2">
          {error && <p className="mr-auto text-xs text-red-600">{error}</p>}
          <button
            type="button"
            disabled={pending}
            onClick={() => decide("rejected")}
            className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-500 transition hover:border-[#B75454] hover:text-[#B75454] disabled:opacity-50"
          >
            退回
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => decide("approved")}
            className="rounded-lg bg-[#5F7563] px-2.5 py-1 text-xs font-medium text-white transition hover:bg-[#516357] disabled:opacity-50"
          >
            核准撥款
          </button>
        </div>
      )}
    </li>
  );
}
