"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadReceiptFile } from "@/lib/supabase/storage";
import type { RepairItemStatus } from "@/lib/supabase/types";

export interface RepairItemFormState {
  error?: string;
  success?: boolean;
}

export interface RepairReviewResult {
  error?: string;
  success?: boolean;
}

/** 業務／員工送出一筆維修請款，狀態一律從 pending（待會計審核）開始。 */
export async function createRepairItem(
  _prevState: RepairItemFormState | undefined,
  formData: FormData
): Promise<RepairItemFormState> {
  const { profile } = await requireTenantUser();

  const carId = String(formData.get("car_id") ?? "");
  const itemName = String(formData.get("item_name") ?? "").trim();
  const vendorName = String(formData.get("vendor_name") ?? "").trim();
  const handlerName = String(formData.get("handler_name") ?? "").trim();
  const receiptNumber = String(formData.get("receipt_number") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();

  if (!carId) {
    return { error: "缺少車輛 ID，無法送出請款。" };
  }
  if (!itemName) {
    return { error: "請輸入維修項目名稱。" };
  }
  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount) || amount < 0) {
    return { error: "請輸入正確的請款金額。" };
  }

  const supabase = await createClient();

  // 單據/發票一律走檔案上傳，存到私有的 repair-evidences bucket，
  // 資料庫欄位存的是物件路徑，不是網址（顯示時再由伺服器簽發 signed URL）。
  // 憑證上傳失敗（或丟出未預期例外）不擋這筆請款送出——金額/項目等主要
  // 資料才是審核用得到的核心欄位，憑證缺席頂多之後請業務補傳，不該讓
  // 整張表單卡住、白白遺失剛才填好的內容。
  let evidencePath: string | null = null;
  const receiptFile = formData.get("receipt");
  if (receiptFile instanceof File && receiptFile.size > 0) {
    try {
      const { path, error: uploadError } = await uploadReceiptFile(
        supabase,
        profile.tenant_id!,
        carId,
        receiptFile
      );
      if (uploadError) {
        console.error(`[createRepairItem] 憑證上傳失敗（請款紀錄仍會送出）：${uploadError}`);
      } else {
        evidencePath = path;
      }
    } catch (e) {
      console.error(`[createRepairItem] 憑證上傳發生未預期錯誤（請款紀錄仍會送出）：`, e);
    }
  }

  const { error } = await supabase.from("repair_items").insert({
    tenant_id: profile.tenant_id!,
    car_id: carId,
    item_name: itemName,
    vendor_name: vendorName || null,
    handler_name: handlerName || null,
    amount,
    receipt_number: receiptNumber || null,
    evidence_path: evidencePath,
    status: "pending",
  });

  if (error) {
    return { error: `送出維修請款失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * 會計審核：核准撥款 / 退回。
 * 刻意限制只有 tenant_admin（車行管理員，扮演會計角色 —— 系統目前沒有
 * 獨立的「會計」角色）能執行，一般員工只能送出申請、不能自己核准自己的
 * 請款。前端也會隱藏這兩顆按鈕，但實際的權限判斷一定要在這裡（伺服器端）
 * 再做一次，不能只靠前端藏起來。
 */
export async function reviewRepairItem(
  itemId: string,
  decision: Extract<RepairItemStatus, "approved" | "rejected">
): Promise<RepairReviewResult> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "沒有權限執行會計審核，請聯繫車行管理員。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("repair_items")
    .update({ status: decision, reviewed_at: new Date().toISOString() })
    .eq("id", itemId);

  if (error) {
    return { error: `更新審核狀態失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
