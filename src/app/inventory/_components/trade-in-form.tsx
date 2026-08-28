"use client";

// 「我要估車」頁的表單本體——用 useActionState 串接 trade-in-actions.ts 的
// submitTradeInRequest()，跟後台品牌設定表單（brand-settings-module.tsx）
// 同一套 React Server Action 慣例，只是這裡完全不用登入。送出成功後就地
// 顯示感謝訊息（不清空重填、也不導頁），讓使用者清楚看到自己的資料真的
// 送出去了。
import { useActionState } from "react";
import { submitTradeInRequest, type TradeInRequestState } from "../trade-in-actions";

const initialTradeInState: TradeInRequestState = {};

const TRADE_IN_INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2 text-sm text-[#171717] outline-none placeholder:text-[#A3A3A3] transition-colors duration-200 focus:border-[#171717] focus:bg-white";

export function TradeInForm({ tenantId }: { tenantId: string }) {
  const [state, formAction, pending] = useActionState(submitTradeInRequest, initialTradeInState);

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <div className="text-center">
        <p className="font-showroom-display text-[11px] uppercase tracking-[0.3em] text-[#737373]">
          Trade-In
        </p>
        <h2 className="font-showroom-display mt-2 text-2xl tracking-wide text-[#171717] sm:text-3xl">
          我要估車
        </h2>
        <p className="mt-2 text-sm text-[#737373]">
          有舊車想換新車，或單純想了解目前車況能賣多少錢？留下聯絡方式，我們會盡快與您聯繫。
        </p>
      </div>

      {state?.success ? (
        <div className="mt-8 rounded-2xl border border-[#D4D4D4] bg-white px-6 py-10 text-center">
          <p className="font-showroom-display text-lg text-[#171717]">已收到您的估車申請</p>
          <p className="mt-2 text-sm text-[#737373]">我們會盡快與您聯繫，感謝您的耐心等候。</p>
        </div>
      ) : (
        <form
          action={formAction}
          className="mt-8 space-y-4 rounded-2xl border border-[#E5E5E5] bg-white p-5 sm:p-6"
        >
          <input type="hidden" name="tenant_id" value={tenantId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[#404040]">姓名 *</label>
              <input name="name" required placeholder="您的稱呼" className={TRADE_IN_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#404040]">聯絡電話 *</label>
              <input name="phone" required placeholder="方便聯繫的電話" className={TRADE_IN_INPUT_CLASS} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#404040]">LINE ID（選填）</label>
            <input name="line_id" placeholder="方便的話留下 LINE ID" className={TRADE_IN_INPUT_CLASS} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[#404040]">廠牌</label>
              <input name="brand" placeholder="例如：Toyota" className={TRADE_IN_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#404040]">車型</label>
              <input name="model_name" placeholder="例如：Camry" className={TRADE_IN_INPUT_CLASS} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[#404040]">年份</label>
              <input name="year" type="number" placeholder="例如：2020" className={TRADE_IN_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#404040]">里程（公里）</label>
              <input name="mileage" type="number" placeholder="例如：50000" className={TRADE_IN_INPUT_CLASS} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#404040]">備註</label>
            <textarea
              name="note"
              rows={3}
              placeholder="其他想讓我們知道的車況資訊"
              className={TRADE_IN_INPUT_CLASS + " resize-y"}
            />
          </div>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
              {state.error}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={pending}
              className="btn-tex-primary font-showroom-display inline-flex items-center justify-center rounded-sm border border-[#171717] bg-[#171717] px-6 py-2.5 text-sm tracking-wide text-white shadow-[0_0_0_1px_rgba(191,160,116,0.55)] transition-all duration-300 ease-out hover:bg-white hover:text-[#171717] hover:shadow-[0_0_0_1.5px_#BFA074,0_10px_28px_-10px_rgba(191,160,116,0.55)] active:scale-[0.97] active:duration-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
            >
              {pending ? "送出中…" : "送出估車申請"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
