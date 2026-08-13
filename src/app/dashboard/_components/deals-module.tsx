"use client";

import { useState } from "react";
import type { Car, Customer, Deal, DealStatus } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";
import { DealFormModal } from "./deal-form-modal";
import { DealContractPreview } from "./deal-contract-preview";

const STATUS_LABEL: Record<DealStatus, string> = {
  draft: "草約",
  signed: "已簽約",
  delivered: "已交車",
};

const STATUS_STYLE: Record<DealStatus, string> = {
  draft: "bg-neutral-100 text-neutral-500 ring-neutral-200",
  signed: "bg-[#FBF1E4] text-[#B4813E] ring-[#F0DFC0]",
  delivered: "bg-[#EEF2ED] text-[#5F7563] ring-[#D9E2D6]",
};

type ModalState = { mode: "create" } | { mode: "edit"; deal: Deal } | null;

export function DealsModule({
  deals,
  cars,
  customers,
  staff,
  canSetCommission,
  tenantName,
}: {
  deals: Deal[];
  cars: Car[];
  customers: Customer[];
  staff: { id: string; name: string | null }[];
  canSetCommission: boolean;
  tenantName?: string;
}) {
  const [modalState, setModalState] = useState<ModalState>(null);
  const [previewDeal, setPreviewDeal] = useState<Deal | null>(null);

  const carById = new Map(cars.map((c) => [c.id, c]));

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-800">買賣合約與交易</h2>
          <p className="mt-0.5 text-xs text-neutral-400">共 {deals.length} 筆合約</p>
        </div>
        <button
          type="button"
          onClick={() => setModalState({ mode: "create" })}
          className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066]"
        >
          + 新增合約
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">車輛</th>
              <th className="px-4 py-2 font-medium">客戶</th>
              <th className="px-4 py-2 font-medium">成交價</th>
              <th className="px-4 py-2 font-medium">訂金/尾款</th>
              <th className="px-4 py-2 font-medium">貸款進度</th>
              <th className="px-4 py-2 font-medium">狀態</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {deals.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  尚無合約紀錄
                </td>
              </tr>
            )}
            {deals.map((deal) => {
              const car = carById.get(deal.car_id);
              return (
                <tr key={deal.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 text-neutral-800">
                    {car ? `${car.brand ? `${car.brand} ` : ""}${car.model_name}` : "（已刪除車輛）"}
                  </td>
                  <td className="px-4 py-2">
                    <p className="text-neutral-800">{deal.customer_name}</p>
                    <p className="text-xs text-neutral-400">{deal.customer_phone ?? "—"}</p>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{formatCurrency(deal.final_price)}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {deal.deposit_amount != null ? formatCurrency(deal.deposit_amount) : "—"}
                    {" / "}
                    {deal.balance_amount != null ? formatCurrency(deal.balance_amount) : "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{deal.loan_status ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset " +
                        STATUS_STYLE[deal.status]
                      }
                    >
                      {STATUS_LABEL[deal.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setPreviewDeal(deal)}
                        className="text-neutral-400 underline-offset-2 hover:text-[#A6793D] hover:underline"
                      >
                        合約預覽
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalState({ mode: "edit", deal })}
                        className="text-neutral-400 underline-offset-2 hover:text-[#A6793D] hover:underline"
                      >
                        編輯
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalState && (
        <DealFormModal
          mode={modalState.mode}
          deal={modalState.mode === "edit" ? modalState.deal : undefined}
          cars={cars}
          customers={customers}
          staff={staff}
          canSetCommission={canSetCommission}
          onClose={() => setModalState(null)}
        />
      )}

      {previewDeal && (
        <DealContractPreview
          deal={previewDeal}
          car={carById.get(previewDeal.car_id)}
          tenantName={tenantName}
          onClose={() => setPreviewDeal(null)}
        />
      )}
    </section>
  );
}
