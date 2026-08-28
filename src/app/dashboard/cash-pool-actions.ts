"use server";

// 「資金總覽」現金流水池：期初餘額設定 + 手動記一筆其他現金異動。
// 計算邏輯（把 deals/cars/company_expenses/transactions 四個來源換算成
// 現金/銀行水池增減）在 src/lib/cash-pool.ts，這個檔案只負責寫入。
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions } from "@/lib/permissions";
import type { CashPoolMethod, TransactionType } from "@/lib/supabase/types";

export interface CashPoolFormState {
  error?: string;
  success?: boolean;
}

const VALID_METHODS: CashPoolMethod[] = ["cash", "bank"];
const VALID_TYPES: TransactionType[] = ["income", "expense"];

function optionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

/**
 * 設定／調整水池起算點：起算日當下的現金／銀行餘額。只有車行管理員能
 * 動——這是整個水池計算的基準，改動會讓兩個池子的餘額整個跟著變，不能
 * 讓一般業務隨手調整。跟品牌設定（tenant-actions.ts）同一套權限限制。
 */
export async function saveCashPoolOpening(
  _prevState: CashPoolFormState | undefined,
  formData: FormData
): Promise<CashPoolFormState> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "只有車行管理員能設定資金水池的起算點，請聯繫管理員協助。" };
  }

  const startedAt = String(formData.get("cash_pool_started_at") ?? "").trim();
  const cashRaw = String(formData.get("cash_opening_balance") ?? "").trim();
  const bankRaw = String(formData.get("bank_opening_balance") ?? "").trim();

  if (!startedAt) {
    return { error: "請選擇起算日期。" };
  }
  const cashOpening = Number(cashRaw);
  const bankOpening = Number(bankRaw);
  if (cashRaw === "" || !Number.isFinite(cashOpening) || cashOpening < 0) {
    return { error: "請輸入正確的現金起算金額。" };
  }
  if (bankRaw === "" || !Number.isFinite(bankOpening) || bankOpening < 0) {
    return { error: "請輸入正確的銀行起算金額。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      cash_opening_balance: cashOpening,
      bank_opening_balance: bankOpening,
      cash_pool_started_at: startedAt,
    })
    .eq("id", profile.tenant_id!);

  if (error) {
    return { error: `設定失敗：${error.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/**
 * 手動記一筆「其他現金異動」——不屬於成交收款／公司開銷／進貨付款的部分，
 * 例如老闆存入/提領、銀行利息、轉帳手續費。寫進本來就存在、但一直沒被用
 * 到的 transactions 表。跟公司開銷用同一套 canViewCost 權限把關。
 */
export async function createManualCashTransaction(
  _prevState: CashPoolFormState | undefined,
  formData: FormData
): Promise<CashPoolFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canViewCost) {
    return { error: "沒有權限新增資金紀錄，請聯繫車行管理員開啟「檢視成本與底價」權限。" };
  }

  const date = String(formData.get("date") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const paymentMethod = String(formData.get("payment_method") ?? "").trim();

  if (!date) return { error: "請選擇日期。" };
  if (!VALID_TYPES.includes(type as TransactionType)) return { error: "請選擇正確的收支類型。" };
  if (!category) return { error: "請輸入類別。" };
  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount) || amount <= 0) {
    return { error: "請輸入正確的金額。" };
  }
  if (!VALID_METHODS.includes(paymentMethod as CashPoolMethod)) {
    return { error: "請選擇正確的現金／銀行歸類。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert({
    tenant_id: profile.tenant_id!,
    date,
    type: type as TransactionType,
    category,
    amount,
    payment_method: paymentMethod as CashPoolMethod,
    note: optionalText(formData, "note"),
  });

  if (error) {
    return { error: `新增失敗：${error.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/** 刪除一筆手動記帳（例如記錯了）。跟新增一樣受 canViewCost 把關；RLS 的
 * transactions_tenant_scoped policy 再確保只能刪到自己車行的資料。 */
export async function deleteManualCashTransaction(transactionId: string): Promise<CashPoolFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canViewCost) {
    return { error: "沒有權限刪除資金紀錄，請聯繫車行管理員開啟「檢視成本與底價」權限。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", transactionId);

  if (error) {
    return { error: `刪除失敗：${error.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}
