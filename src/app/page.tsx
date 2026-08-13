import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/dal";

export default async function RootPage() {
  try {
    const { profile } = await getCurrentProfile();
    
    if (profile?.role === "super_admin") {
      redirect("/super-admin");
    } else {
      redirect("/dashboard");
    }
  } catch (error) {
    // 當抓不到 profile、未登入或 Supabase 連線錯誤時，安全強制導向登入頁
    redirect("/login");
  }
}
