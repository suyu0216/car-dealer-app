"use server";

// 公開展間（/inventory）「我要估車」表單專用的 Server Action——這是
// /inventory 路由樹底下第一個真正的 Server Action 檔案，跟 /dashboard
// 底下那些 Server Action 最大的不同是：呼叫者是「完全未登入的訪客」，
// 不能用 requireTenantUser() 驗證身份，安全邊界改靠：
//   1. Supabase RLS 的 trade_in_requests_public_insert policy（只允許
//      INSERT，且限制在「目前開放中」的車行，見 supabase_schema.sql）；
//   2. 這裡自己做的欄位格式檢查（必填欄位、年份／里程是合理數字）。
//
// createNotification() 原本只在已登入的後台 Server Action 內部被呼叫
// （見該檔案開頭的說明），這裡是第一個從「未登入公開頁」呼叫它的地方——
// 能這樣呼叫是因為 notifications 表 2026-08 新增了 anon 的 insert 授權，
// 且限制在 type = 'trade_in_request_created' 這一種類型（見
// supabase_schema.sql 的 notifications_public_trade_in_insert policy），
// 不是把整張表對外開放。
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/supabase/notifications";

export interface TradeInRequestState {
  error?: string;
  success?: boolean;
}

function optionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

/** 年份／里程這種數字欄位：空白視為「沒填」，填了但不是合理數字就當
 * 錯誤格式忽略（不擋整張表單送出——這只是估價參考用的輔助資訊，不值得
 * 因為使用者不小心打錯字元就讓整份表單送不出去）。 */
function optionalInt(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/**
 * 顧客在公開展間頁「我要估車」表單送出估價需求——寫入 trade_in_requests
 * 一筆，並呼叫 createNotification() 讓車行後台鈴鐺看得到，見
 * showroom-page.tsx 的表單區塊。
 */
export async function submitTradeInRequest(
  _prevState: TradeInRequestState | undefined,
  formData: FormData
): Promise<TradeInRequestState> {
  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  if (!tenantId) {
    return { error: "缺少車行資訊，請透過車行提供的專屬連結重新開啟頁面後再試一次。" };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "請填寫姓名。" };
  }

  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) {
    return { error: "請填寫聯絡電話。" };
  }

  const brand = optionalText(formData, "brand");
  const modelName = optionalText(formData, "model_name");

  const supabase = await createClient();

  const { error } = await supabase.from("trade_in_requests").insert({
    tenant_id: tenantId,
    name,
    phone,
    line_id: optionalText(formData, "line_id"),
    brand,
    model_name: modelName,
    year: optionalInt(formData, "year"),
    mileage: optionalInt(formData, "mileage"),
    note: optionalText(formData, "note"),
  });

  if (error) {
    // RLS 擋下來（例如車行已被停權/尚未核准）也會落到這個分支——不對外
    // 洩漏「是不是這間車行的問題」這種內部狀態，一律顯示同一句籠統訊息。
    console.error(`[submitTradeInRequest] 寫入失敗（tenant ${tenantId}）：`, error.message);
    return { error: "送出失敗，請稍後再試一次，或直接透過 LINE／電話聯繫我們。" };
  }

  const carDesc = [brand, modelName].filter(Boolean).join(" ");
  await createNotification({
    tenantId,
    type: "trade_in_request_created",
    title: "新的估車申請",
    message: `${name}（${phone}）送出了一份估車申請${carDesc ? `：${carDesc}` : ""}`,
    actorName: name,
    link: "?module=tradeIns",
  });

  return { success: true };
}
