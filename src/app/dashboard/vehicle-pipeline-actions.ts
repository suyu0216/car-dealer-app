"use server";

// 「公積金」——安安自己的說法，指「還沒真的入庫/交車、但已經知道會有」的
// 訂金收支：進貨（錢即將付給賣家/車商）、客戶預訂（錢即將跟客戶收）。
// 2026-09-05 追加：這裡原本叫「調車中」，安安反映錢要付出去買車叫
// 「進貨」，UI 跟這個檔案的文案都改成「進貨」，direction 的值本身仍是
// 英文 "purchase"，資料庫/型別不受影響。
// 見 supabase 遷移 create_vehicle_pipeline_entries、
// src/lib/supabase/types.ts 的 VehiclePipelineEntry 開頭說明。
//
// 設計上刻意跟 cars/deals 兩張表不綁定——安安明確表示車還沒回來時資料
// 不齊全，沒辦法（也不應該）先建一筆正式車輛/合約紀錄，等車真的回來，
// 員工才會用現有的「新增車輛」流程正式建檔；這裡純粹是記錄／規劃用的
// 清單，跟正式的收支明細用「確認入帳」這個動作串起來（見
// confirmVehiclePipelineDeposit 開頭的說明），而不是資料表層級的外鍵
// 關聯。
//
// 權限分兩層，跟「維修/整備請款」申請 vs 核准撥款是同一套精神：
// - 建立/編輯/標記完成/取消：canEditCars 就能做——這只是記錄跟規劃，
//   business/採購同仁不用會計權限也該記得下來。
// - 確認訂金已入帳（會真的在 transactions 表寫一筆手動記帳、影響資金
//   總覽跟帳戶收支明細的餘額）：要 canManageFinance，跟其他手動記帳
//   動作一致。
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions } from "@/lib/permissions";
import { currentTaiwanDateKey } from "@/lib/format";
import type { CashPoolMethod, VehiclePipelineDirection } from "@/lib/supabase/types";

export interface VehiclePipelineFormState {
  error?: string;
  success?: boolean;
}

const VALID_DIRECTIONS: VehiclePipelineDirection[] = ["purchase", "preorder"];
const VALID_METHODS: CashPoolMethod[] = ["cash", "bank"];

function optionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

function canRecord(profile: Parameters<typeof getEffectivePermissions>[0]) {
  const p = getEffectivePermissions(profile);
  return p.canEditCars || p.canManageFinance;
}

/** 新增一筆「公積金」紀錄——進貨或客戶預訂，都只是先記錄，不影響任何
 * 真正的財務數字。 */
export async function createVehiclePipelineEntry(
  _prevState: VehiclePipelineFormState | undefined,
  formData: FormData
): Promise<VehiclePipelineFormState> {
  const { profile } = await requireTenantUser();
  if (!canRecord(profile)) {
    return { error: "沒有權限新增公積金紀錄，請聯繫車行管理員開啟「編輯車輛」或「管理財務」權限。" };
  }

  const direction = String(formData.get("direction") ?? "").trim();
  const vehicleDescription = String(formData.get("vehicle_description") ?? "").trim();
  const depositAmountRaw = String(formData.get("deposit_amount") ?? "").trim();
  const expectedBalanceRaw = String(formData.get("expected_balance_amount") ?? "").trim();
  const expectedDate = optionalText(formData, "expected_date");

  if (!VALID_DIRECTIONS.includes(direction as VehiclePipelineDirection)) {
    return { error: "請選擇這筆是「進貨」還是「客戶預訂」。" };
  }
  if (!vehicleDescription) {
    return { error: "請輸入車型說明，例如「2020 BMW X3 白色」。" };
  }
  const depositAmount = depositAmountRaw === "" ? 0 : Number(depositAmountRaw);
  if (!Number.isFinite(depositAmount) || depositAmount < 0) {
    return { error: "訂金金額請填正確的數字。" };
  }
  let expectedBalance: number | null = null;
  if (expectedBalanceRaw !== "") {
    expectedBalance = Number(expectedBalanceRaw);
    if (!Number.isFinite(expectedBalance) || expectedBalance < 0) {
      return { error: "預計尾款金額請填正確的數字。" };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_pipeline_entries").insert({
    tenant_id: profile.tenant_id!,
    direction: direction as VehiclePipelineDirection,
    vehicle_description: vehicleDescription,
    counterparty_name: optionalText(formData, "counterparty_name"),
    counterparty_contact: optionalText(formData, "counterparty_contact"),
    deposit_amount: depositAmount,
    expected_balance_amount: expectedBalance,
    expected_date: expectedDate,
    note: optionalText(formData, "note"),
    created_by: profile.id,
  });

  if (error) {
    return { error: `新增失敗：${error.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/** 編輯一筆還沒確認入帳的公積金紀錄（車型說明／對方資訊／金額／預計
 * 日期／備註）。已經確認入帳、已完成或已取消的紀錄不能再改金額，避免
 * 跟已經真的入帳的那筆手動記帳對不起來——要調整的話，先去帳戶管理／
 * 資金總覽把那筆手動記帳作廢，這裡的狀態才有辦法改回「尚未確認」
 * （目前版本尚未開放這條回頭路，需要的話請直接跟我說）。 */
export async function updateVehiclePipelineEntry(
  _prevState: VehiclePipelineFormState | undefined,
  formData: FormData
): Promise<VehiclePipelineFormState> {
  const { profile } = await requireTenantUser();
  if (!canRecord(profile)) {
    return { error: "沒有權限修改公積金紀錄，請聯繫車行管理員開啟「編輯車輛」或「管理財務」權限。" };
  }

  const entryId = String(formData.get("entry_id") ?? "").trim();
  if (!entryId) return { error: "找不到要修改的紀錄。" };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("vehicle_pipeline_entries")
    .select("id, status")
    .eq("id", entryId)
    .eq("tenant_id", profile.tenant_id!)
    .maybeSingle();
  if (!existing) return { error: "找不到這筆紀錄。" };
  if (existing.status !== "pending") {
    return { error: "這筆紀錄已經確認入帳／完成／取消，不能再修改金額與內容。" };
  }

  const vehicleDescription = String(formData.get("vehicle_description") ?? "").trim();
  const depositAmountRaw = String(formData.get("deposit_amount") ?? "").trim();
  const expectedBalanceRaw = String(formData.get("expected_balance_amount") ?? "").trim();

  if (!vehicleDescription) {
    return { error: "請輸入車型說明。" };
  }
  const depositAmount = depositAmountRaw === "" ? 0 : Number(depositAmountRaw);
  if (!Number.isFinite(depositAmount) || depositAmount < 0) {
    return { error: "訂金金額請填正確的數字。" };
  }
  let expectedBalance: number | null = null;
  if (expectedBalanceRaw !== "") {
    expectedBalance = Number(expectedBalanceRaw);
    if (!Number.isFinite(expectedBalance) || expectedBalance < 0) {
      return { error: "預計尾款金額請填正確的數字。" };
    }
  }

  const { error } = await supabase
    .from("vehicle_pipeline_entries")
    .update({
      vehicle_description: vehicleDescription,
      counterparty_name: optionalText(formData, "counterparty_name"),
      counterparty_contact: optionalText(formData, "counterparty_contact"),
      deposit_amount: depositAmount,
      expected_balance_amount: expectedBalance,
      expected_date: optionalText(formData, "expected_date"),
      note: optionalText(formData, "note"),
    })
    .eq("id", entryId);

  if (error) {
    return { error: `修改失敗：${error.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/**
 * 確認一筆公積金訂金「真的入帳了」——這是唯一一個會真正動到財務數字的
 * 動作：在 transactions 表建立一筆手動記帳（purchase 方向是支出、
 * preorder 方向是收入），金額/日期/付款方式/帳戶都由這裡的表單決定
 * （預設帶入這筆紀錄原本填的訂金金額，但允許微調——例如實際付出去的
 * 金額跟當初預計的差一點）。建立成功後，把這筆公積金紀錄的狀態改成
 * deposit_paid、記下真正入帳日期跟連到哪一筆 transactions，資金總覽／
 * 帳戶管理的收支明細就會同步看到這筆錢。
 *
 * 只能對還沒確認過的（status === 'pending'）紀錄做這個動作，避免重複
 * 入帳；同時要求 payment_method（現金/銀行）——這樣不管安安是看舊版
 * 「資金總覽」還是新版「帳戶管理」，這筆錢都算得到，跟
 * createManualCashTransaction() 的要求完全一致。
 */
export async function confirmVehiclePipelineDeposit(
  _prevState: VehiclePipelineFormState | undefined,
  formData: FormData
): Promise<VehiclePipelineFormState> {
  const { profile } = await requireTenantUser();
  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限確認訂金入帳，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
  }

  const entryId = String(formData.get("entry_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim() || currentTaiwanDateKey();
  const paymentMethod = String(formData.get("payment_method") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const accountId = optionalText(formData, "account_id");

  if (!entryId) return { error: "找不到這筆公積金紀錄。" };
  if (!VALID_METHODS.includes(paymentMethod as CashPoolMethod)) {
    return { error: "請選擇正確的現金／銀行歸類。" };
  }
  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount) || amount <= 0) {
    return { error: "請輸入正確的入帳金額。" };
  }

  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("vehicle_pipeline_entries")
    .select("id, tenant_id, direction, vehicle_description, counterparty_name, status")
    .eq("id", entryId)
    .eq("tenant_id", profile.tenant_id!)
    .maybeSingle();
  if (!entry) return { error: "找不到這筆公積金紀錄。" };
  if (entry.status !== "pending") {
    return { error: "這筆紀錄已經確認過入帳，不能重複確認。" };
  }

  if (accountId) {
    const { data: accountRow } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("tenant_id", profile.tenant_id!)
      .eq("is_active", true)
      .maybeSingle();
    if (!accountRow) {
      return { error: "選擇的帳戶不存在或已停用，請重新選擇。" };
    }
  }

  const isPurchase = entry.direction === "purchase";
  const category = isPurchase
    ? `進貨訂金：${entry.vehicle_description}`
    : `客戶預訂訂金：${entry.vehicle_description}${entry.counterparty_name ? `（${entry.counterparty_name}）` : ""}`;

  const { data: inserted, error: insertError } = await supabase
    .from("transactions")
    .insert({
      tenant_id: profile.tenant_id!,
      date,
      type: isPurchase ? "expense" : "income",
      category,
      amount,
      payment_method: paymentMethod as CashPoolMethod,
      account_id: accountId,
      note: optionalText(formData, "note"),
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { error: `確認入帳失敗：${insertError?.message ?? "未知錯誤"}` };
  }

  const { error: updateError } = await supabase
    .from("vehicle_pipeline_entries")
    .update({
      status: "deposit_paid",
      deposit_paid_at: date,
      deposit_account_id: accountId,
      deposit_transaction_id: inserted.id,
    })
    .eq("id", entryId);

  if (updateError) {
    // 手動記帳已經寫進去了，只是這筆公積金紀錄的狀態更新失敗——不回頭
    // 刪掉剛剛那筆真正的收支紀錄（那才是真的錢，比公積金清單本身的狀態
    // 更重要），只回報錯誤，請使用者重新整理頁面確認狀態。
    return { error: `已經記到收支明細了，但更新公積金狀態失敗：${updateError.message}，請重新整理頁面確認。` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/** 標記完成——車已經到貨（purchase）或已經交車（preorder），流程結束。
 * 純粹是這份清單自己的狀態，不會去動 cars/deals 任何資料，員工要另外
 * 用「新增車輛」／「買賣合約」正式建檔。 */
export async function markVehiclePipelineFulfilled(entryId: string): Promise<VehiclePipelineFormState> {
  const { profile } = await requireTenantUser();
  if (!canRecord(profile)) {
    return { error: "沒有權限修改公積金紀錄，請聯繫車行管理員開啟「編輯車輛」或「管理財務」權限。" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_pipeline_entries")
    .update({ status: "fulfilled" })
    .eq("id", entryId)
    .eq("tenant_id", profile.tenant_id!);
  if (error) return { error: `更新失敗：${error.message}` };
  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/** 標記取消——賣家跳票、客戶反悔等。已經確認入帳過的紀錄（訂金是真的
 * 錢）取消時只改這裡的狀態，不會自動把那筆手動記帳作廢——訂金退不退、
 * 要不要作廢那筆收支，請到帳戶管理／資金總覽自己處理，這裡不代替妳
 * 做這個判斷。 */
export async function markVehiclePipelineCancelled(entryId: string): Promise<VehiclePipelineFormState> {
  const { profile } = await requireTenantUser();
  if (!canRecord(profile)) {
    return { error: "沒有權限修改公積金紀錄，請聯繫車行管理員開啟「編輯車輛」或「管理財務」權限。" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_pipeline_entries")
    .update({ status: "cancelled" })
    .eq("id", entryId)
    .eq("tenant_id", profile.tenant_id!);
  if (error) return { error: `更新失敗：${error.message}` };
  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/** 刪除一筆公積金紀錄——只允許還沒確認過入帳的（status === 'pending'）
 * 紀錄刪除，避免刪掉之後找不到對應的真正收支紀錄是哪一筆。已經確認/
 * 完成/取消的紀錄只能留著當歷史紀錄，不能刪。 */
export async function deleteVehiclePipelineEntry(entryId: string): Promise<VehiclePipelineFormState> {
  const { profile } = await requireTenantUser();
  if (!canRecord(profile)) {
    return { error: "沒有權限刪除公積金紀錄，請聯繫車行管理員開啟「編輯車輛」或「管理財務」權限。" };
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("vehicle_pipeline_entries")
    .select("id, status")
    .eq("id", entryId)
    .eq("tenant_id", profile.tenant_id!)
    .maybeSingle();
  if (!existing) return { error: "找不到這筆紀錄。" };
  if (existing.status !== "pending") {
    return { error: "這筆紀錄已經確認入帳／完成／取消，不能刪除，只能留著當歷史紀錄。" };
  }
  const { error } = await supabase.from("vehicle_pipeline_entries").delete().eq("id", entryId);
  if (error) return { error: `刪除失敗：${error.message}` };
  revalidatePath("/dashboard/accounting");
  return { success: true };
}
