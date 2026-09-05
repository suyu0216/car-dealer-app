"use server";

// 「資金總覽」現金流水池：期初餘額設定 + 手動記一筆其他現金異動。
// 計算邏輯（把 deals/cars/company_expenses/transactions 四個來源換算成
// 現金/銀行水池增減）在 src/lib/cash-pool.ts，這個檔案只負責寫入。
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions } from "@/lib/permissions";
import { currentTaiwanDateKey } from "@/lib/format";
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
 * 到的 transactions 表。
 * 2026-08-29 修正：原本跟公司開銷一樣共用 canViewCost 權限把關，但
 * accounting/page.tsx 的「資金總覽」分頁實際是用 canManageFinance 決定
 * 要不要顯示——理由跟 company-expenses-actions.ts 同一批修正一致，改成
 * 跟頁面實際邏輯對齊。
 */
export async function createManualCashTransaction(
  _prevState: CashPoolFormState | undefined,
  formData: FormData
): Promise<CashPoolFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限新增資金紀錄，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
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

  // 2026-09-04 新增：金流架構 Phase 2——選填指定這筆手動紀錄是哪個帳戶
  // 的收支（新版多帳戶架構，跟上面 payment_method 現金/銀行並存）。確認
  // 帳戶真的是這個車行自己的、而且還在使用中，理由跟其他幾支 action 的
  // 同一段檢查一樣。
  const accountId = optionalText(formData, "account_id");
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

  const { error } = await supabase.from("transactions").insert({
    tenant_id: profile.tenant_id!,
    date,
    type: type as TransactionType,
    category,
    amount,
    payment_method: paymentMethod as CashPoolMethod,
    account_id: accountId,
    note: optionalText(formData, "note"),
  });

  if (error) {
    return { error: `新增失敗：${error.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/**
 * 作廢一筆手動記帳（例如記錯了）。
 *
 * 2026-09-05 改法：安安看到同行的 Hocar 系統帳目報表是「作廢＋沖銷」而
 * 不是直接刪除——刪除會讓查帳的人完全看不出「這裡本來有一筆、後來被
 * 拿掉了」，帳目經不起稽核。改成：原始那一列標記「已作廢」（voided_at／
 * voided_by），保留在資料庫裡不刪；同時自動插入一筆金額相反、日期是
 * 「今天」（不是回填原始日期，才不會動到原始那個月份的報表數字）的
 * 「沖銷」列（reversed_transaction_id 指回原始列）。兩列都留底可查。
 *
 * 因為金額互相抵銷（原始 +$100 收入、沖銷就是 -$100，也就是一筆金額
 * $100 的支出；原始 -$100 支出、沖銷就是 +$100 收入），financial-
 * ledger.ts／cash-pool.ts 既有靠「加總全部事件」算餘額的邏輯完全不用
 * 改，兩筆一沖就自動歸零，不會讓帳戶餘額跑掉。
 *
 * 防呆：已經作廢過的原始列不能重複作廢；沖銷列本身不能被作廢（沖銷列
 * 要留著對應原始列，不能再被沖銷的沖銷，那樣會讓帳目更難看懂）。
 *
 * 跟新增一樣受 canManageFinance 把關；RLS 的 transactions_tenant_scoped
 * policy 再確保只能動到自己車行的資料。
 */
export async function voidManualCashTransaction(transactionId: string): Promise<CashPoolFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限作廢資金紀錄，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
  }

  const supabase = await createClient();

  const { data: original } = await supabase
    .from("transactions")
    .select(
      "id, tenant_id, type, category, amount, payment_method, account_id, note, voided_at, reversed_transaction_id"
    )
    .eq("id", transactionId)
    .maybeSingle();

  if (!original) {
    return { error: "找不到這筆紀錄，可能已經被作廢或刪除。" };
  }
  if (original.reversed_transaction_id) {
    return { error: "這是一筆沖銷紀錄，不能再作廢。" };
  }
  if (original.voided_at) {
    return { error: "這筆紀錄已經作廢過了，不能重複作廢。" };
  }

  const { error: voidError } = await supabase
    .from("transactions")
    .update({ voided_at: new Date().toISOString(), voided_by: profile.id })
    .eq("id", transactionId);
  if (voidError) {
    return { error: `作廢失敗：${voidError.message}` };
  }

  const reversalType: TransactionType = original.type === "income" ? "expense" : "income";
  const { error: reversalError } = await supabase.from("transactions").insert({
    tenant_id: original.tenant_id,
    date: currentTaiwanDateKey(),
    type: reversalType,
    category: `沖銷：${original.category}`,
    amount: original.amount,
    payment_method: original.payment_method,
    account_id: original.account_id,
    reversed_transaction_id: original.id,
    note: original.note ? `原始備註：${original.note}` : null,
  });

  if (reversalError) {
    // 沖銷列寫入失敗，把剛剛的作廢標記復原，避免出現「已作廢但沒有對應
    // 沖銷列」這種帳目對不起來的中間狀態。
    await supabase.from("transactions").update({ voided_at: null, voided_by: null }).eq("id", transactionId);
    return { error: `作廢失敗：${reversalError.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}
