"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import type { TenantStatus } from "@/lib/supabase/types";

const VALID_STATUSES: TenantStatus[] = ["pending", "active", "suspended"];

/**
 * 平台管理員審核／開通／停權車商。RLS 的 tenants_super_admin_all 是最後
 * 一道防線（一般車行的 profile 完全碰不到別間車行的 tenants 列），這裡
 * 先做一次角色檢查，錯誤訊息比較友善。
 */
export async function updateTenantStatus(
  tenantId: string,
  status: TenantStatus
): Promise<{ error?: string }> {
  await requireSuperAdmin();

  if (!VALID_STATUSES.includes(status)) {
    return { error: "狀態不正確。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tenants").update({ status }).eq("id", tenantId);

  if (error) {
    return { error: `更新車行狀態失敗：${error.message}` };
  }

  revalidatePath("/super-admin");
  revalidatePath("/inventory");
  return {};
}
