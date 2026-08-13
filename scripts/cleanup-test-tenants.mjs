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

await supabase.auth.signInWithPassword({
  email: "superadmin-test-1786598740621@example.com",
  password: "TestPass123!",
});

const { data: testTenants } = await supabase
  .from("tenants")
  .select("id, name")
  .or("name.like.測試車商-%,name.like.super-admin-test-shell-%");

console.log("找到的測試車行：", testTenants);

for (const t of testTenants ?? []) {
  const { error } = await supabase.from("tenants").delete().eq("id", t.id);
  console.log(`刪除 ${t.name}: ${error ? "❌ " + error.message : "✅"}`);
}
