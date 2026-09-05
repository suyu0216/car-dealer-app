// 共用常數：src/proxy.ts（Middleware）跟 src/lib/supabase/dal.ts 都要用
// 同一個標頭名稱——寫在同一個檔案匯出，避免兩邊各自手打字串、其中一邊
// 打錯字就悄悄失效（dal.ts 讀不到，退回原本每次都打一次 Supabase Auth
// 驗證，不是安全問題，但會讓這個效能優化不知不覺失效卻沒有任何錯誤
// 訊息，很難發現）。
//
// 用途：proxy.ts 對 PROTECTED_PREFIXES（/dashboard、/super-admin）的請求
// 呼叫過一次 supabase.auth.getUser()（會真的連線到 Supabase Auth 驗證
// token 有沒有被竄改/過期），驗證通過後把使用者 id 寫進這個標頭，轉發給
// 後面的 Server Component；dal.ts 的 getCurrentProfile() 看到這個標頭
// 就直接信任、不用再對 Supabase Auth 打一次網路來回——同一個請求裡對
// 同一件事（有沒有登入）驗證兩次，原本是看得到的延遲來源。
//
// 安全前提（一定要遵守，不然就是嚴重的身分冒用漏洞）：這個標頭只能由
// proxy.ts 設定，而且 proxy.ts 必須在「所有」分支（公開路徑、非受保護
// 路徑、受保護但驗證失敗）都主動清掉外部請求本來就帶著的同名標頭，只有
// 「受保護路徑 + 真的通過 getUser() 驗證」這唯一一條路徑才會被重新設回
// 正確的值。少清一個分支，就等於讓任何人只要在請求裡自己加這個標頭、
// 填任意使用者 id，就能繞過登入驗證直接冒充成該使用者。
export const VERIFIED_USER_ID_HEADER = "x-verified-user-id";
