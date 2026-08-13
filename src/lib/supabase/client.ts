"use client";

// 瀏覽器端 Supabase client（給 Client Components 使用，例如登入表單的即時驗證）。
//
// 注意：這裡刻意不傳入 `Database`泛型給 createBrowserClient。這個專案安裝的
// @supabase/postgrest-js@2.112.2 在解析手寫的 Database 型別時，會把
// `Schema`（Database['public']）結構檢查失敗後 fallback 成 `never`，導致所有
// `.from().select()` 的回傳型別悄悄變成 `never`／`null`，卻不會直接報型別
// 不合法的錯誤，非常難debug。改為讓 client 走預設的寬鬆型別，實際的資料
// 形狀改用 src/lib/supabase/types.ts 匯出的 Tenant / Profile / Car /
// Transaction 型別，在讀取資料後用 `as` 明確標註（見 dashboard、
// super-admin、dal.ts 等檔案）。
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
