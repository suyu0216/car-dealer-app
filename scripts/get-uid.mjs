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

const email = process.argv[2];
const password = process.argv[3];
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) throw error;
console.log("user id:", data.user.id);
