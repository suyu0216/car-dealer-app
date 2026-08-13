"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions } from "@/lib/permissions";
import type { DealStatus } from "@/lib/supabase/types";

export interface DealFormState {
  error?: string;
  success?: boolean;
}

const VALID_STATUSES: DealStatus[] = ["draft", "signed", "delivered"];

function optionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

function optionalMoney(formData: FormData, name: string, label: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${label}格式不正確。`);
  }
  return num;
}

// canSetCommission 為 false 時，回傳物件裡完全不帶 commission_amount 這個
// key（不是帶 null）——這樣 supabase-js 送出的 JSON payload 會直接省略
// 這個欄位，UPDATE 時不會覆蓋掉管理員原本填好的抽成金額，INSERT 時則會
// 用資料庫預設值（null）。一般業務不開放自己填抽成，避免球員兼裁判。
function parseDealForm(formData: FormData, canSetCommission: boolean) {
  const carId = String(formData.get("car_id") ?? "");
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const finalPriceRaw = String(formData.get("final_price") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");

  if (!carId) throw new Error("請選擇車輛。");
  if (!customerName) throw new Error("請輸入客戶姓名，或從既有客戶選擇。");
  const finalPrice = Number(finalPriceRaw);
  if (finalPriceRaw === "" || !Number.isFinite(finalPrice) || finalPrice < 0) {
    throw new Error("請輸入正確的成交價。");
  }
  if (!VALID_STATUSES.includes(status as DealStatus)) {
    throw new Error("合約狀態不正確。");
  }

  const customerId = optionalText(formData, "customer_id");

  return {
    car_id: carId,
    customer_id: customerId,
    customer_name: customerName,
    customer_phone: optionalText(formData, "customer_phone"),
    final_price: finalPrice,
    deposit_amount: optionalMoney(formData, "deposit_amount", "訂金"),
    balance_amount: optionalMoney(formData, "balance_amount", "尾款"),
    loan_status: optionalText(formData, "loan_status"),
    salesperson_id: optionalText(formData, "salesperson_id"),
    ...(canSetCommission
      ? { commission_amount: optionalMoney(formData, "commission_amount", "預估抽成") }
      : {}),
    status: status as DealStatus,
    note: optionalText(formData, "note"),
  };
}

export async function createDeal(
  _prevState: DealFormState | undefined,
  formData: FormData
): Promise<DealFormState> {
  const { profile } = await requireTenantUser();

  let values;
  try {
    values = parseDealForm(formData, getEffectivePermissions(profile).canManageStaff);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "表單資料不正確。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .insert({ ...values, tenant_id: profile.tenant_id! });

  if (error) {
    return { error: `新增合約失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateDeal(
  _prevState: DealFormState | undefined,
  formData: FormData
): Promise<DealFormState> {
  const { profile } = await requireTenantUser();

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { error: "缺少合約 ID，無法更新。" };
  }

  let values;
  try {
    values = parseDealForm(formData, getEffectivePermissions(profile).canManageStaff);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "表單資料不正確。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("deals").update(values).eq("id", id);

  if (error) {
    return { error: `更新合約失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
