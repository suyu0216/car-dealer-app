// 注意：Next.js 16 把 middleware.ts 改名為 proxy.ts，行為不變。
//
// 修復 ERR_TOO_MANY_REDIRECTS（/login <-> /dashboard 無限重導向）的設計原則：
//
// 1. /login、/auth/*（含 email 驗證回呼）一律是完全公開路徑。proxy 對這些
//    路徑「完全不」建立 Supabase client、不檢查 session、不做任何重導向，
//    直接 NextResponse.next() 放行。沒有邏輯就不可能形成迴圈 —— 這是刻意
//    的設計，不要在這裡加上「已登入就導去 /dashboard」之類的判斷，那正是
//    先前造成無限重導向的原因（proxy 把 /login 導去 /dashboard，
//    /dashboard 頁面又因為某種原因把使用者導回 /login，兩邊互相拉扯）。
// 2. 只有 PROTECTED_PREFIXES 列出的頁面（/dashboard、/super-admin）才需要
//    proxy 驗證：未登入 -> 導去 /login。這是唯一一種、單向的重導向。
// 3. 「已登入的使用者不應該停在 /login」這件事，交給 src/app/page.tsx
//    （首頁 `/`）處理：它用 Server Component + src/lib/supabase/dal.ts
//    依角色導向 /dashboard 或 /super-admin，未登入則導去 /login。因為
//    proxy 永遠不會把 /login 導開，/login 這條路徑是不折不扣的「終點」，
//    不會再被彈去別的地方，自然不可能跟任何頁面互相循環重導向。
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { VERIFIED_USER_ID_HEADER } from "@/lib/auth-header";

const PROTECTED_PREFIXES = ["/dashboard", "/super-admin"];
const PUBLIC_PREFIXES = ["/login", "/auth"];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** 一律先清掉外部請求本來可能就帶著的驗證標頭——見 auth-header.ts 的
 * 安全前提說明：不管等一下要走哪個分支，都要先從一份「乾淨」的標頭
 * 複本開始，確保這個標頭只可能是這支 middleware 自己驗證通過後才設的，
 * 不會有任何分支讓外部偽造的值原封不動穿透到後面的 Server Component。 */
function cleanRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.delete(VERIFIED_USER_ID_HEADER);
  return headers;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const cleanHeaders = cleanRequestHeaders(request);

  // 公開路徑：完全不碰 Supabase、不重導向，永遠直接放行。
  if (matchesPrefix(path, PUBLIC_PREFIXES)) {
    return NextResponse.next({ request: { headers: cleanHeaders } });
  }

  // 非受保護路徑（例如首頁 `/`）：一樣不需要 proxy 介入，交給頁面自己的
  // Server Component 判斷要不要導向，proxy 在這裡只會製造額外的重導向
  // 分支、增加迴圈風險，所以刻意什麼都不做。
  if (!matchesPrefix(path, PROTECTED_PREFIXES)) {
    return NextResponse.next({ request: { headers: cleanHeaders } });
  }

  // 走到這裡才是真的受保護頁面，才需要驗證 session。
  let response = NextResponse.next({ request: { headers: cleanHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request: { headers: cleanHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 只做 cookie 讀取的樂觀驗證；不在這裡打 profiles 表做角色判斷
  // （角色/租戶檢查在 dal.ts 裡做，靠近資料源，proxy 只負責「有沒有登入」）。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // 2026-08 效能優化：這裡已經對這次請求做過一次真正的網路驗證
    // （getUser() 會連線 Supabase Auth 確認 token 沒被竄改、沒過期），
    // 把驗證結果轉發給後面的 Server Component，dal.ts 的
    // getCurrentProfile() 看到這個標頭就不用再對 Supabase Auth 打第二次
    // 網路來回——見 auth-header.ts 的完整安全前提說明。
    cleanHeaders.set(VERIFIED_USER_ID_HEADER, user.id);
    const verifiedResponse = NextResponse.next({ request: { headers: cleanHeaders } });
    // 上面 getUser() 過程中若刷新了過期 token，刷新後的 cookie 會寫進
    // `response`；這裡把它們原封不動搬到帶有驗證標頭的最終回應上，
    // 避免剛刷新好的 session 被平白丟掉。
    response.cookies.getAll().forEach((cookie) => {
      verifiedResponse.cookies.set(cookie);
    });
    return verifiedResponse;
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";

  const redirectResponse = NextResponse.redirect(url);
  // getUser() 過程中若刷新了過期 token，刷新後的 cookie 會寫進上面的
  // `response`；這裡把它們原封不動搬到 redirect response 上，避免剛刷新
  // 好的 session 被平白丟掉，導致下一次請求又帶著舊 token 再刷新一次失敗
  // （refresh token 是一次性的），造成忽登入忽未登入的 flapping。
  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
