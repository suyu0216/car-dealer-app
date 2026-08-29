"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { getEffectivePermissions } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { uploadReceiptFile } from "@/lib/supabase/storage";
import { createNotification } from "@/lib/supabase/notifications";
import { formatCurrency } from "@/lib/format";
// 類別清單改從這個普通模組匯入，不能自己在這個 "use server" 檔案裡
// export const 陣列——那樣 Client Component import 進去會壞掉（陣列會
// 變成一個 Server Action 參照，不是真的陣列），見
// src/lib/repair-item-constants.ts 開頭的說明。
import { REPAIR_ITEM_CATEGORIES } from "@/lib/repair-item-constants";
import type { RepairItemCategory, RepairItemStatus } from "@/lib/supabase/types";

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
  // 沒選類別（例如舊版前端快取還沒更新）就預設「維修」，跟資料庫欄位的
  // 預設值一致，不會擋住送出。
  const categoryRaw = String(formData.get("category") ?? "維修").trim();

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
  if (!REPAIR_ITEM_CATEGORIES.includes(categoryRaw as RepairItemCategory)) {
    return { error: "請選擇正確的請款類別。" };
  }
  const category = categoryRaw as RepairItemCategory;

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

  // select("id") 拿回剛新增那筆的 id，讓下面的通知可以帶上「傳送門」連結
  // 直接指到這一筆，不是只導去整備維修分頁讓人自己找。
  const { data: inserted, error } = await supabase
    .from("repair_items")
    .insert({
      tenant_id: profile.tenant_id!,
      car_id: carId,
      item_name: itemName,
      vendor_name: vendorName || null,
      handler_name: handlerName || null,
      amount,
      receipt_number: receiptNumber || null,
      evidence_path: evidencePath,
      status: "pending",
      category,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: `送出維修請款失敗：${error?.message ?? "未知錯誤"}` };
  }

  // 通知車行管理員有新的請款待審核——鈴鐺通知，讓管理員不用一直手動
  // 進「整備維修」分頁才知道有新的東西要處理。link 帶上 highlight=該筆 id，
  // 讓管理員點通知就直接跳到、並反白這一筆，不用在列表裡自己找。寫入
  // 失敗只記錄錯誤，見 createNotification() 的說明。
  await createNotification({
    tenantId: profile.tenant_id!,
    type: "repair_item_pending",
    title: "新的維修請款待審核",
    message: `${profile.name ?? "有人"} 提交了一筆「${itemName}」（${category}）請款，金額 ${formatCurrency(amount)}`,
    actorName: profile.name,
    link: `?module=maintenance&highlight=${inserted.id}`,
  });

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * 會計審核：核准撥款 / 退回。
 * 2026-08-29 起改用 canApproveRepairs（見 src/lib/permissions.ts）判斷，
 * 不再只認 tenant_admin：老闆一律有這個權限，「會計」角色預設也有，
 * 「店長」「員工」則預設沒有、但老闆可以在「帳號與權限管理」個別開放。
 * 一般員工只能送出申請、不能自己核准自己的請款。前端也會隱藏這兩顆
 * 按鈕，但實際的權限判斷一定要在這裡（伺服器端）再做一次，不能只靠
 * 前端藏起來。
 */
export async function reviewRepairItem(
  itemId: string,
  decision: Extract<RepairItemStatus, "approved" | "rejected">
): Promise<RepairReviewResult> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canApproveRepairs) {
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
