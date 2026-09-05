"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import type { TradeInRequestStatus } from "@/lib/supabase/types";

export interface TradeInReviewResult {
  error?: string;
  success?: boolean;
}

const VALID_STATUSES: TradeInRequestStatus[] = ["new", "contacted", "closed"];

/**
 * 後台「估車申請」管理：更新單筆估價需求單的處理狀態（待處理／已聯繫／
 * 已結案）。跟 repair-items-actions.ts 的 reviewRepairItem() 同一套「client
 * 端用 useTransition 直接呼叫，不用整個 form」的輕量寫法——見
 * trade-in-module.tsx，這裡只是切換一個下拉選單狀態，不需要
 * useActionState 的表單語意。不像 reviewRepairItem() 限制只有
 * tenant_admin 能操作，這裡任何登入的車行成員都能改狀態，跟 CRM 客戶
 * 跟進狀態同一個開放程度（估車申請本質上也是業務跟進工作，不是需要
 * 特別把關的財務審核）。
 */
export async function updateTradeInStatus(
  requestId: string,
  status: TradeInRequestStatus
): Promise<TradeInReviewResult> {
  await requireTenantUser();

  if (!VALID_STATUSES.includes(status)) {
    return { error: "狀態不正確。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("trade_in_requests")
    .update({ status })
    .eq("id", requestId);

  if (error) {
    return { error: `更新狀態失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
