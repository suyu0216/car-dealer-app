// 「管理員 client」——用 Supabase service role key 建立，會完全繞過 RLS，
// 對整個資料庫有完整讀寫權限。只能在伺服器端使用，而且只能用在「一定要
// 有平台級管理員權限才能做到」的操作。目前唯一的用途：邀請員工帳號（見
// src/app/dashboard/staff-actions.ts 的 inviteStaffMember()）——這件事
// 本質上是「幫別人在 Supabase Auth 開一個帳號」，一般 anon/authenticated
// 角色的 client 完全沒有這個 API 能力，只有 service role 才能呼叫
// `supabase.auth.admin.inviteUserByEmail()`。
//
// 絕對不能：
//   1. 把這支 client import 進任何 Client Component（"use client"）或會被
//      打包進瀏覽器的程式碼——只能從 "use server" 的 Server Action 檔案
//      裡 import 使用。SUPABASE_SERVICE_ROLE_KEY 一旦外洩，等於任何人都能
//      繞過所有租戶隔離、直接讀寫全部車行的資料，比資料庫密碼外洩還嚴重。
//   2. 用來取代一般的 createClient()（server.ts）——日常的資料查詢/寫入
//      都應該讓 RLS 照常把關，不要因為方便就到處改用 admin client。
//
// SUPABASE_SERVICE_ROLE_KEY 這個環境變數請直接在你自己的 .env.local（本機
// 開發）跟 Vercel 專案的環境變數設定（正式環境）裡加，不要寫進任何會進
// 版本控制的檔案。從 Supabase 後台 Project Settings → API 頁面，找到
// service_role 那把 key（不是最上面的 anon / publishable key）複製過來。
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "缺少 SUPABASE_SERVICE_ROLE_KEY 環境變數，無法邀請員工帳號。請到 Supabase 後台 Project Settings → API 複製 service_role key，加進 .env.local（本機）跟 Vercel 專案環境變數（正式環境），設定完成後重新啟動伺服器再試一次。"
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
