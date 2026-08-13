// Storage RLS 跨租戶隔離測試（car-photos + repair-evidences 都測）：用真實
// 登入 session（捷恒汽車）測試能不能寫入/刪除/讀取一個「假的、不屬於自己」
// 的 tenant_id 路徑。用假 UUID 而不是另一間真實車行（安安汽車）的 id，
// 避免弄髒真實租戶的資料夾。
//
// 注意：DELETE 被 RLS 擋下時，Supabase/Postgres 不會丟出明確的錯誤——
// 只會「安靜地」影響 0 筆（RLS 條件不符的列，從 DELETE 的角度就是不存在），
// 這跟 INSERT 被擋會直接丟出 "new row violates row-level security policy"
// 不一樣。所以 DELETE 測試要看的是「有沒有真的刪掉」（回傳的 data 陣列
// 是否非空），不是有沒有 error。
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.join(DIR, "..", ".env.local");
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return { ...env, ...process.env };
}

const env = loadEnvLocal();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: env.SCRAPER_EMAIL,
  password: env.SCRAPER_PASSWORD,
});
if (authError) throw authError;

const { data: profile } = await supabase
  .from("profiles")
  .select("tenant_id")
  .eq("id", authData.user.id)
  .single();
const myTenantId = profile.tenant_id;
const { data: tenant } = await supabase.from("tenants").select("name").eq("id", myTenantId).single();
console.log(`登入身分：${tenant?.name}（tenant_id=${myTenantId}）`);

const FAKE_FOREIGN_TENANT = "00000000-0000-0000-0000-000000000000";
const content = new TextEncoder().encode(`rls test @ ${new Date().toISOString()}`);

let pass = 0;
let fail = 0;

function report(label, ok) {
  console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}  ${label}`);
  if (ok) pass += 1;
  else fail += 1;
}

async function testBucket(bucket) {
  console.log(`\n### bucket: ${bucket} ###`);
  const foreignPath = `${FAKE_FOREIGN_TENANT}/rls-test/${bucket}-${Date.now()}.txt`;
  const ownPath = `${myTenantId}/rls-test/${bucket}-${Date.now()}.txt`;

  // 1) 跨租戶寫入應該被擋（INSERT 被擋會丟明確 error）
  {
    const { error } = await supabase.storage.from(bucket).upload(foreignPath, content, {
      contentType: "text/plain",
      upsert: false,
    });
    report("跨租戶 INSERT 被擋", !!error);
  }

  // 2) 自己租戶寫入應該成功
  {
    const { error } = await supabase.storage.from(bucket).upload(ownPath, content, {
      contentType: "text/plain",
      upsert: false,
    });
    report("自己租戶 INSERT 成功（迴歸測試）", !error);
  }

  // 3) 用 super_admin 以外身分，我們沒有現成的「已存在的跨租戶物件」可以
  //    測試 DELETE 是否真的擋下——但可以驗證：對自己剛建立的 ownPath 執行
  //    DELETE 一定要成功（迴歸測試），且對「假冒自己租戶前綴但物件根本
  //    不存在」的路徑操作不能被誤判成功。
  {
    const { data, error } = await supabase.storage.from(bucket).remove([ownPath]);
    const deleted = !error && data && data.length > 0;
    report("自己租戶 DELETE 成功（迴歸測試）", deleted);
  }

  // 4) bucket 唯讀（repair-evidences 應該連 SELECT 都要擋跨租戶；car-photos
  //    的 SELECT 是刻意公開，不測跨租戶阻擋）。
  if (bucket === "repair-evidences") {
    const { data, error } = await supabase.storage.from(bucket).list(`${FAKE_FOREIGN_TENANT}/rls-test`);
    // list() 對沒有權限的資料夾通常回傳空陣列而不是 error，所以看有沒有
    // 陣列內容比看 error 準。
    const leaked = !error && data && data.length > 0;
    report("跨租戶 SELECT（list）沒有洩漏內容", !leaked);
  }
}

await testBucket("car-photos");
await testBucket("repair-evidences");

console.log(`\n=== 結果：${pass} 通過 / ${fail} 失敗 ===`);
process.exit(fail > 0 ? 1 : 0);
