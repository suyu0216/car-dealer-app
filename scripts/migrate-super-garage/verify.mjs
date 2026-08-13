import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, readJsonIfExists, IMPORT_MAP_JSON, VEHICLES_JSON } from "./lib.mjs";

const env = loadEnvLocal();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: env.SCRAPER_EMAIL,
  password: env.SCRAPER_PASSWORD,
});
if (authError) throw authError;

const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", authData.user.id).single();
const tenantId = profile.tenant_id;

const { count: carsCount } = await supabase
  .from("cars")
  .select("id", { count: "exact", head: true })
  .eq("tenant_id", tenantId);

const { count: photosCount } = await supabase
  .from("car_photos")
  .select("id", { count: "exact", head: true })
  .eq("tenant_id", tenantId);

console.log("cars in tenant (authenticated, all statuses):", carsCount);
console.log("car_photos in tenant (authenticated):", photosCount);

const map = readJsonIfExists(IMPORT_MAP_JSON, {});
const mapEntries = Object.values(map);
console.log("import-map entries:", mapEntries.length);
console.log("  status=done:", mapEntries.filter((e) => e.status === "done").length);
console.log("  total photos_done recorded:", mapEntries.reduce((s, e) => s + (e.photos_done || 0), 0));

const store = readJsonIfExists(VEHICLES_JSON, null);
console.log("vehicles.json count:", store.vehicles.length);
console.log("vehicles.json total images:", store.vehicles.reduce((s, v) => s + (v.advanced_info?.vehicle_images?.length || 0), 0));

// cars missing image_url despite having photos
const carIds = mapEntries.map((e) => e.car_id);
const { data: carsRows } = await supabase.from("cars").select("id, brand, model_name, image_url, status").in("id", carIds);
const missingImage = carsRows.filter((c) => !c.image_url);
console.log(`\n沒有 image_url 的匯入車輛：${missingImage.length} / ${carsRows.length}`);
missingImage.slice(0, 10).forEach((c) => console.log(`  - ${c.brand} ${c.model_name} (${c.id}) status=${c.status}`));
