"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import type { CustomerFollowUpStatus } from "@/lib/supabase/types";

export interface CustomerFormState {
  error?: string;
  success?: boolean;
}

const VALID_STATUSES: CustomerFollowUpStatus[] = [
  "new",
  "test_drive_followup",
  "deposit_received",
  "delivery_care",
];

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

function parseCustomerForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("follow_up_status") ?? "new");

  if (!name) {
    throw new Error("請輸入客戶姓名。");
  }
  if (!VALID_STATUSES.includes(status as CustomerFollowUpStatus)) {
    throw new Error("跟進狀態不正確。");
  }

  return {
    name,
    phone: optionalText(formData, "phone"),
    interested_model: optionalText(formData, "interested_model"),
    budget_min: optionalMoney(formData, "budget_min", "預算下限"),
    budget_max: optionalMoney(formData, "budget_max", "預算上限"),
    follow_up_status: status as CustomerFollowUpStatus,
    line_id: optionalText(formData, "line_id"),
    note: optionalText(formData, "note"),
  };
}

export async function createCustomer(
  _prevState: CustomerFormState | undefined,
  formData: FormData
): Promise<CustomerFormState> {
  const { profile } = await requireTenantUser();

  let values;
  try {
    values = parseCustomerForm(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "表單資料不正確。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .insert({ ...values, tenant_id: profile.tenant_id! });

  if (error) {
    return { error: `新增客戶失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateCustomer(
  _prevState: CustomerFormState | undefined,
  formData: FormData
): Promise<CustomerFormState> {
  await requireTenantUser();

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { error: "缺少客戶 ID，無法更新。" };
  }

  let values;
  try {
    values = parseCustomerForm(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "表單資料不正確。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("customers").update(values).eq("id", id);

  if (error) {
    return { error: `更新客戶失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
