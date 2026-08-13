// Data Access Layer：集中管理「目前登入者是誰、屬於哪個車行、什麼角色」。
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./server";
import type { Profile } from "./types";

export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, tenant_id, role, name, can_view_cost, can_view_salary, can_edit_cars, created_at")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    console.error("[dal.getCurrentProfile] 找不到 profile：", {
      userId: user.id,
      userEmail: user.email,
      supabaseError: error,
    });

    // 如果沒有 profile，安全引導回登入頁，帶上記錄資訊
    const params = new URLSearchParams({ error: "profile_missing" });
    params.set("uid", user.id);
    if (user.email) params.set("email", user.email);

    redirect(`/login?${params.toString()}`);
  }

  return { user, profile: profile as Profile };
});

/** 只允許 super_admin 進入的頁面使用。 */
export async function requireSuperAdmin() {
  const { user, profile } = await getCurrentProfile();
  if (profile.role !== "super_admin") {
    redirect("/dashboard");
  }
  return { user, profile };
}

/** 只允許一般車商（tenant_admin / staff）進入的頁面使用。 */
export async function requireTenantUser() {
  const { user, profile } = await getCurrentProfile();
  if (profile.role === "super_admin") {
    redirect("/super-admin");
  }
  if (!profile.tenant_id) {
    redirect("/login?error=no_tenant");
  }
  return { user, profile };
}