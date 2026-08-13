// 產生目前這次請求的網站來源網址，用來組出 Email 驗證信裡的重新導向連結
// （supabase.auth.signUp 的 emailRedirectTo）。
// 優先使用 NEXT_PUBLIC_SITE_URL（正式環境建議設定，避免被代理 header 影響），
// 否則退回用請求的 host header 組出來。
import { headers } from "next/headers";

export async function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");

  return `${proto}://${host}`;
}
