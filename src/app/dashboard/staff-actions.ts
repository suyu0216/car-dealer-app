"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/supabase/types";

export interface StaffActionResult {
  error?: string;
  success?: boolean;
}

const MANAGEABLE_ROLES: Role[] = ["tenant_admin", "staff"];

/**
 * 兩支 Server Action 共用的權限檢查：
 *   1. 呼叫者必須是車行管理員（tenant_admin）——前端「帳號與權限管理」頁面
 *      本來就只有管理員看得到，這裡是後端第二道防線，避免一般業務繞過
 *      前端直接呼叫這支 Server Action。
 *   2. 不能對自己動手——避免管理員不小心把自己降級或關掉自己的權限、
 *      結果整個車行沒人有管理權限可以改回來。要調整某個管理員帳號，
 *      得請「另一位」管理員操作。
 * 真正的租戶邊界（不能改到別間車行的帳號）交給 supabase_schema.sql 裡的
 * `profiles_tenant_admin_manage` RLS policy 負責，這裡不用再查一次。
 */
async function assertCanManage(targetProfileId: string) {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { ok: false as const, error: "沒有權限執行這項操作，請聯繫車行管理員。" };
  }
  if (targetProfileId === profile.id) {
    return { ok: false as const, error: "無法在這裡調整自己的角色/權限，請請另一位管理員協助。" };
  }
  return { ok: true as const };
}

/** 切換員工角色：管理員 Admin（tenant_admin） ⇄ 一般業務 Sales（staff）。 */
export async function updateStaffRole(
  targetProfileId: string,
  role: Role
): Promise<StaffActionResult> {
  const check = await assertCanManage(targetProfileId);
  if (!check.ok) return { error: check.error };

  if (!MANAGEABLE_ROLES.includes(role)) {
    return { error: "角色不正確。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", targetProfileId);

  if (error) {
    return { error: `更新角色失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * 更新單一員工的三個權限細項開關。一次只切換一個開關，所以呼叫端要把
 * 「這個人現在完整的三個值」都帶上（切換那個開關取反、其他兩個維持原樣），
 * 不能只傳被改動的那一個欄位，不然沒被提到的欄位在 Supabase update 裡
 * 會被當成「不變更」，這點呼叫端（settings-module.tsx）已經處理好了。
 */
export async function updateStaffPermissions(
  targetProfileId: string,
  permissions: { can_view_cost: boolean; can_view_salary: boolean; can_edit_cars: boolean }
): Promise<StaffActionResult> {
  const check = await assertCanManage(targetProfileId);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      can_view_cost: !!permissions.can_view_cost,
      can_view_salary: !!permissions.can_view_salary,
      can_edit_cars: !!permissions.can_edit_cars,
    })
    .eq("id", targetProfileId);

  if (error) {
    return { error: `更新權限失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
