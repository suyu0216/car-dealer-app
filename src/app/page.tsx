import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/dal";

// 首頁不顯示任何內容，純粹依登入狀態轉導：
// 未登入 -> /login；已登入 -> 依角色分流到 /dashboard 或 /super-admin。
export default async function RootPage() {
  // getCurrentProfile() 未登入時會直接 redirect('/login')。
  const { profile } = await getCurrentProfile();

  redirect(profile.role === "super_admin" ? "/super-admin" : "/dashboard");
}
