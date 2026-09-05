"use client";

import type { Car, Deal } from "@/lib/supabase/types";
import { formatCurrency, formatDate } from "@/lib/format";

export function DealContractPreview({
  deal,
  car,
  tenantName,
  onClose,
}: {
  deal: Deal;
  car: Car | undefined;
  tenantName?: string;
  onClose: () => void;
}) {
  return (
    // 背景不綁 onClick，跟其他彈窗行為一致（雖然這裡是唯讀預覽，沒有表單
    // 資料會遺失，但點外面不關閉是全站統一的互動規則）。
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4 py-8 print:static print:bg-transparent print:p-0">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .deal-contract-sheet, .deal-contract-sheet * { visibility: visible; }
          .deal-contract-sheet { position: fixed; inset: 0; }
        }
      `}</style>

      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-xl print:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="deal-contract-sheet p-8 text-neutral-800">
          <div className="flex items-center justify-between border-b-2 border-neutral-800 pb-3">
            <h1 className="text-2xl font-bold">中古車買賣合約書</h1>
            <p className="text-sm text-neutral-500">
              {formatDate(deal.created_at)}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-xs text-neutral-400">甲方（出售方）</p>
              <p className="mt-1 font-medium">{tenantName ?? "本車行"}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">乙方（購買方）</p>
              <p className="mt-1 font-medium">{deal.customer_name}</p>
              <p className="text-neutral-500">{deal.customer_phone ?? "—"}</p>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              標的車輛
            </p>
            <p className="mt-1 text-lg font-semibold">
              {car ? `${car.brand ?? ""} ${car.model_name}` : "（車輛資料遺失）"}
            </p>
            {car && (
              <div className="mt-2 grid grid-cols-3 gap-3 text-sm text-neutral-600">
                <p>年式：{car.year ?? "—"}</p>
                <p>里程：{car.mileage != null ? `${car.mileage.toLocaleString("zh-TW")} km` : "—"}</p>
                <p>車牌：{car.license_plate ?? "—"}</p>
                <p>車色：{car.color ?? "—"}</p>
                <p>VIN：{car.vin ?? "—"}</p>
              </div>
            )}
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              價金約定
            </p>
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-neutral-100">
                <ContractRow label="成交價" value={formatCurrency(deal.final_price)} />
                <ContractRow
                  label="訂金"
                  value={deal.deposit_amount != null ? formatCurrency(deal.deposit_amount) : "—"}
                />
                <ContractRow
                  label="尾款"
                  value={deal.balance_amount != null ? formatCurrency(deal.balance_amount) : "—"}
                />
                <ContractRow label="貸款進度" value={deal.loan_status ?? "無"} />
              </tbody>
            </table>
          </div>

          <p className="mt-8 text-xs leading-relaxed text-neutral-500">
            雙方同意依上列條件成立本買賣合約，車輛現況已由乙方確認，交車後如有其他約定事項，
            雙方應另行以書面補充之。本文件為系統自動產生之合約預覽，正式簽署前請由雙方詳細核對內容。
          </p>

          <div className="mt-10 grid grid-cols-2 gap-6 text-sm">
            <div className="border-t border-neutral-300 pt-2">甲方簽章：＿＿＿＿＿＿＿＿＿＿</div>
            <div className="border-t border-neutral-300 pt-2">乙方簽章：＿＿＿＿＿＿＿＿＿＿</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-200 p-4 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            關閉
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066]"
          >
            🖨️ 列印合約預覽
          </button>
        </div>
      </div>
    </div>
  );
}

function ContractRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="py-1.5 text-neutral-500">{label}</td>
      <td className="py-1.5 text-right font-medium tabular-nums">{value}</td>
    </tr>
  );
}
