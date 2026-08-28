"use server";

// 給鈴鐺下拉選單（NotificationBell.tsx）呼叫的 Server Action：標記單一
// 通知已讀、或全部標記已讀。寫入通知本身（createNotification）不在這裡，
// 那是給其他 Server Action 內部呼叫的輔助函式，見
// src/lib/supabase/notifications.ts 開頭的說明。
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";

export interface NotificationActionState {
  error?: string;
  success?: boolean;
}

/** 標記單一通知已讀——RLS 的 notifications_tenant_scoped policy 已經限制
 * 只能改到自己車行的通知，不需要在這裡額外檢查 tenant_id。 */
export async function markNotificationRead(notificationId: string): Promise<NotificationActionState> {
  await requireTenantUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);

  if (error) {
    return { error: `標記已讀失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/** 全部標記已讀——只影響自己車行、目前還沒讀過的通知。 */
export async function markAllNotificationsRead(): Promise<NotificationActionState> {
  const { profile } = await requireTenantUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("tenant_id", profile.tenant_id!)
    .eq("is_read", false);

  if (error) {
    return { error: `全部標記已讀失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounting");
  return { success: true };
}
