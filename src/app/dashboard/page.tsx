import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { createReceiptSignedUrls } from "@/lib/supabase/storage";
import { getEffectivePermissions } from "@/lib/permissions";
import { LogoutButton } from "@/app/_components/logout-button";
import { AppTopBar } from "@/app/_components/app-top-bar";
import { DashboardShell } from "./_components/dashboard-shell";
import { OnboardingWizard } from "./_components/onboarding-wizard";
import { PendingApprovalBanner } from "./_components/pending-approval-banner";
import type { Car, Customer, Deal, Profile, RepairItem, Tenant } from "@/lib/supabase/types";

const TENANT_COLUMNS = "id, name, phone, address, business_hours, logo_url, line_id, status, onboarding_completed, created_at";

export default async function DashboardPage() {
  // 驗證登入身份、角色，並確認已被指派車行；否則導回登入頁。
  const { user, profile } = await requireTenantUser();
  const permissions = getEffectivePermissions(profile);

  // RLS 已強制限制只能讀到自己 tenant_id 的資料，這裡不需要額外的 .eq('tenant_id', ...)。
  const supabase = await createClient();

  // 先單獨查車行資料，決定要不要走「停權通知」或「Onboarding 引導」這兩條
  // 提早結束的分支——這兩種情況都不需要再多撈車輛/合約/CRM 這些資料，
  // 先查這一筆比全部塞進同一個 Promise.all、查完才發現用不到划算。
  const { data: tenant } = await supabase
    .from("tenants")
    .select(TENANT_COLUMNS)
    .eq("id", profile.tenant_id!)
    .single();
  const tenantInfo = tenant as Tenant | null;

  // 被停權的車行：後台整個擋下來，只留登出按鈕。見 supabase_schema.sql
  // 對 tenants.status 的說明——這是應用層的擋法，不是 RLS 層。
  if (tenantInfo?.status === "suspended") {
    return <SuspendedNotice />;
  }

  // 還沒完成過 Onboarding 的車行管理員：整個畫面換成引導精靈，不進正常
  // 後台。一般業務（staff）不會卡在這裡——他們沒有權限完成品牌設定，
  // 卡住也無法自己解決，讓他們照舊進正常後台。
  if (profile.role === "tenant_admin" && tenantInfo && !tenantInfo.onboarding_completed) {
    return <OnboardingWizard tenant={tenantInfo} />;
  }

  // 注意：舊版的 transactions（一般收支紀錄）查詢已經移除 —— 財務數據現在
  // 全面由 repair_items（維修請款）跟 cars 的結帳快照（closed_at /
  // closed_prep_cost / closed_total_cost）接管，車行經營數據看板讀的是
  // 這兩個來源，不再需要獨立的 transactions 表資料，畫面上也拿掉了
  // 底部的「收支紀錄」表格跟對應的總收入/總支出/淨利卡片。
  const [{ data: cars }, { data: repairItems }, { data: customers }, { data: deals }, { data: staffProfiles }] =
    await Promise.all([
      supabase
        .from("cars")
        .select(
          // body_type／is_featured／is_large_card 2026-08 補進這個白名單——
          // 原本漏掉這三欄，後台編輯車輛時 car-form-modal.tsx 拿到的
          // car.body_type / car.is_featured / car.is_large_card 永遠是
          // undefined，表單初始值因此永遠顯示「未勾選/未分類」，即使資料庫
          // 裡實際上已經是 true／有分類；存檔當下勾選是有正確寫進資料庫的
          // （updateCar 直接把整份表單值 spread 進 update payload，不受這裡
          // 影響），只是後台畫面重新整理後看起來又「跳回」未勾選，容易讓人
          // 誤以為存檔失敗、忍不住重複勾選重存。三個都補進來後，表單/卡片/
          // 列表才會忠實反映資料庫目前的值。
          "id, tenant_id, brand, model_name, year, license_year, mileage, engine_cc, transmission, color, license_plate, vin, certification, equipment_tags, condition_notes, status, purchase_price, transfer_fee, detailing_cost, repair_cost, floor_price, selling_price, final_price, closed_at, closed_prep_cost, closed_total_cost, paid_amount, payment_method, payment_note, transfer_date, transfer_status, inspection_agency, inspection_date, inspection_status, nominee_company, nominee_days, nominee_start_date, id_return_date, has_used_as_nominee, is_public, body_type, is_featured, is_large_card, image_url, created_at, deleted_at"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("repair_items")
        .select(
          "id, tenant_id, car_id, item_name, vendor_name, handler_name, amount, receipt_number, status, evidence_url, evidence_path, note, reviewed_at, created_at"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("customers")
        .select(
          "id, tenant_id, name, phone, interested_model, budget_min, budget_max, follow_up_status, line_id, note, created_at"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("deals")
        .select(
          "id, tenant_id, car_id, customer_id, customer_name, customer_phone, final_price, deposit_amount, balance_amount, loan_status, salesperson_id, commission_amount, status, note, created_at"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, name, role, can_view_cost, can_view_salary, can_edit_cars")
        .order("name"),
    ]);

  const carList = (cars ?? []) as Car[];
  const repairItemList = (repairItems ?? []) as RepairItem[];
  const customerList = (customers ?? []) as Customer[];
  const dealList = (deals ?? []) as Deal[];
  const staffAccounts = (staffProfiles ?? []) as Pick<
    Profile,
    "id" | "name" | "role" | "can_view_cost" | "can_view_salary" | "can_edit_cars"
  >[];
  // 給下拉選單（維修請款經手人、合約承辦業務）用的輕量版本，跟原本一樣。
  const staffList = staffAccounts.map((p) => ({ id: p.id, name: p.name }));

  // 維修單據存在私有的 repair-evidences bucket，這裡一次幫所有請款項目
  // 簽發短效期（1 小時）signed URL，畫面上才有連結可以點開查看憑證。
  const receiptPaths = repairItemList
    .map((r) => r.evidence_path)
    .filter((p): p is string => !!p);
  const receiptUrls = await createReceiptSignedUrls(supabase, receiptPaths);

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <AppTopBar />
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            {tenantInfo?.name ?? "車行"} 主控台
          </h1>
          <p className="text-sm text-neutral-500">
            {profile.name ?? "使用者"} ・{" "}
            {profile.role === "tenant_admin" ? "車行管理員" : "員工"}
          </p>
          {(tenantInfo?.phone || tenantInfo?.address || tenantInfo?.business_hours) && (
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-400">
              {tenantInfo?.phone && <span>📞 {tenantInfo.phone}</span>}
              {tenantInfo?.address && <span>📍 {tenantInfo.address}</span>}
              {tenantInfo?.business_hours && <span>🕒 {tenantInfo.business_hours}</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* 顧客看車連結：純附加功能，把這輛車行的公開看車頁網址亮出來
              方便複製分享，不影響任何既有頁面/邏輯。/inventory 本身是完全
              公開、不需要登入的路由，見 src/app/inventory/page.tsx。 */}
          <a
            href={`/inventory?tenant=${profile.tenant_id}`}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:border-[#BFA074] hover:text-[#A6793D] sm:inline-block"
          >
            🔗 顧客看車連結
          </a>
          <LogoutButton />
        </div>
      </header>

      {tenantInfo?.status === "pending" && <PendingApprovalBanner />}

      {/* 核心模組：車輛庫存 / 整備維修與會計 / CRM / 合約 / 業務薪資 /
          經營數據看板（僅 canViewCost）/ 帳號與權限管理（僅 canManageStaff） */}
      <DashboardShell
        cars={carList}
        repairItems={repairItemList}
        customers={customerList}
        deals={dealList}
        staff={staffList}
        staffAccounts={staffAccounts}
        currentUserId={user.id}
        receiptUrls={receiptUrls}
        role={profile.role}
        permissions={permissions}
        tenant={tenantInfo}
        tenantName={tenantInfo?.name}
      />
    </div>
  );
}

function SuspendedNotice() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="text-3xl" aria-hidden>
        🚫
      </p>
      <h1 className="mt-3 text-lg font-semibold text-neutral-900">帳號已被停權</h1>
      <p className="mt-2 text-sm text-neutral-500">
        你的車行帳號目前已被平台管理員停權，暫時無法使用後台功能。如有疑問請聯繫平台客服。
      </p>
      <div className="mt-6">
        <LogoutButton />
      </div>
    </div>
  );
}
