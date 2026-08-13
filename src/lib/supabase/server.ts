// 伺服器端 Supabase client（給 Server Components / Server Actions / Route Handlers 使用）。
// `cookies()` 在此版本 Next.js 是 async API，因此這個 factory 也是 async。
//
// 注意：這裡刻意不傳入 `Database` 泛型，理由見 client.ts 開頭的說明。
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // 在 Server Component 中呼叫 setAll 會拋錯（Server Component 不能寫入
            // cookies）。只要有 proxy.ts 定期刷新 session，這裡可以安全忽略。
          }
        },
      },
    }
  );
}
