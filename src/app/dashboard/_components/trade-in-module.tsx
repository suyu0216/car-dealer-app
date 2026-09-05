"use client";

// 後台「估車申請」管理：顯示顧客透過公開看車頁「我要估車」表單送出的
// 估價需求單，讓業務可以標記處理進度。列表本身跟 crm-module.tsx 同一種
// 「表格 + 狀態欄位」結構，狀態切換則比照 car-maintenance-tab.tsx 的
// 審核按鈕，用 useTransition 直接呼叫 Server Action（見
// trade-in-requests-actions.ts），不需要整個表單。
import { useState, useTransition } from "react";
import type { TradeInRequest, TradeInRequestStatus } from "@/lib/supabase/types";
import { updateTradeInStatus } from "../trade-in-requests-actions";

const STATUS_LABEL: Record<TradeInRequestStatus, string> = {
  new: "待處理",
  contacted: "已聯繫",
  closed: "已結案",
};

const STATUS_STYLE: Record<TradeInRequestStatus, string> = {
  new: "bg-amber-50 text-amber-700 ring-amber-200",
  contacted: "bg-blue-50 text-blue-700 ring-blue-200",
  closed: "bg-neutral-100 text-neutral-500 ring-neutral-200",
};

export function TradeInModule({ tradeInRequests }: { tradeInRequests: TradeInRequest[] }) {
  return (
    <section>
      <div>
        <h2 className="text-base font-semibold text-neutral-800">估車申請</h2>
        <p className="mt-0.5 text-xs text-neutral-400">
          顧客透過看車頁「我要估車」表單送出的估價需求，共 {tradeInRequests.length} 筆。
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">送出時間</th>
              <th className="px-4 py-2 font-medium">聯絡人</th>
              <th className="px-4 py-2 font-medium">想估的車</th>
              <th className="px-4 py-2 font-medium">備註</th>
              <th className="px-4 py-2 font-medium">狀態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {tradeInRequests.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  目前沒有估車申請
                </td>
              </tr>
            )}
            {tradeInRequests.map((r) => (
              <TradeInRow key={r.id} request={r} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TradeInRow({ request }: { request: TradeInRequest }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<TradeInRequestStatus>(request.status);
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: TradeInRequestStatus) {
    const prev = status;
    setStatus(next);
    startTransition(async () => {
      const result = await updateTradeInStatus(request.id, next);
      if (result?.error) {
        setError(result.error);
        setStatus(prev);
      } else {
        setError(null);
      }
    });
  }

  const carDesc = [request.brand, request.model_name].filter(Boolean).join(" ");
  const specs = [
    request.year ? `${request.year} 年` : null,
    request.mileage != null ? `${request.mileage.toLocaleString()} 公里` : null,
  ]
    .filter(Boolean)
    .join(" ・ ");

  return (
    <tr className="align-top hover:bg-neutral-50">
      <td className="whitespace-nowrap px-4 py-2 text-neutral-500">
        {new Date(request.created_at).toLocaleString("zh-TW", {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </td>
      <td className="px-4 py-2">
        <p className="font-medium text-neutral-800">{request.name}</p>
        <p className="text-xs text-neutral-400">
          {request.phone}
          {request.line_id && ` ・ LINE：${request.line_id}`}
        </p>
      </td>
      <td className="px-4 py-2 text-neutral-600">
        {carDesc || "—"}
        {specs && <p className="text-xs text-neutral-400">{specs}</p>}
      </td>
      <td className="max-w-xs px-4 py-2 text-neutral-500">{request.note || "—"}</td>
      <td className="px-4 py-2">
        <select
          value={status}
          disabled={pending}
          onChange={(e) => handleChange(e.target.value as TradeInRequestStatus)}
          className={
            "rounded-full px-2.5 py-1 text-xs font-medium outline-none ring-1 ring-inset disabled:opacity-50 " +
            STATUS_STYLE[status]
          }
        >
          {(Object.keys(STATUS_LABEL) as TradeInRequestStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
