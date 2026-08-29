"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/supabase/site-url";
import { uploadStaffAvatar } from "@/lib/supabase/storage";
import { ROLE_DEFAULT_PERMISSIONS } from "@/lib/permissions";
import type { Role } from "@/lib/supabase/types";

/** 六個權限開關的完整組合，updateStaffPermissions／inviteStaffMember／
 * restore_staff_to_tenant 呼叫都用這個型別，避免漏帶欄位。 */
export interface StaffPermissionFlags {
  can_view_cost: boolean;
  can_view_salary: boolean;
  can_edit_cars: boolean;
  can_view_all_salary: boolean;
  can_approve_repairs: boolean;
  can_manage_finance: boolean;
  can_view_analytics: boolean;
}

export interface StaffActionResult {
  error?: string;
  success?: boolean;
}

export interface InviteStaffState {
  error?: string;
  success?: string;
}

export interface MyContactState {
  error?: string;
  success?: string;
  /** 其他欄位已成功更新，但大頭照上傳失敗——不阻斷儲存，比照
   * tenant-actions.ts 對車行 Logo 上傳失敗的處理方式（非阻斷性警告）。 */
  warning?: string;
}

const MANAGEABLE_ROLES: Role[] = ["tenant_admin", "manager", "accountant", "staff"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 兩支 Server Action 共用的權限檢查：
 *   1. 呼叫者必須是車行管理員（tenant_admin）——前端「帳號與權限管理」頁面
 *      本來就只有管理員看得到，這裡是後端第二道防線，避免一般業務繞過
 *      前端直接呼叫這支 Server Action。
 *   2. 不能對自己動手——避免管理員不小心把自己降級或關掉自己的權限、
 *      結果整個車行沒人有管理權限可以改回來。要調整某個管理員帳號，
 *      得請「另一位」管理員操作。
 * 真正的租戶邊界（不能改到別間車行的帳號）交給 supabase_schema.sql 裡的
 * `profiles_tenant_admin_manage` RLS policy 負責，這裡不用再查一次。
 */
async function assertCanManage(targetProfileId: string) {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { ok: false as const, error: "沒有權限執行這項操作，請聯繫車行管理員。" };
  }
  if (targetProfileId === profile.id) {
    return { ok: false as const, error: "無法在這裡調整自己的角色/權限，請請另一位管理員協助。" };
  }
  return { ok: true as const };
}

/**
 * 切換員工角色：老闆（tenant_admin）／店長（manager）／會計（accountant）／
 * 員工（staff）四選一。
 *
 * 2026-08-29：角色一改變，六個權限開關會「一併重設成新角色的預設值」
 * （見 permissions.ts 的 ROLE_DEFAULT_PERMISSIONS），不是保留舊角色留下來
 * 的組合——這是方案二「角色決定預設」的具體實作：把某人從「員工」切成
 * 「會計」，應該立刻拿到會計的完整預設權限（審核請款、看全體薪資、財務
 * 頁面），而不是還卡在員工的權限、要老闆自己再一項一項手動打開。老闆
 * 之後仍然可以在下面的權限開關再個別微調（個人化微調），這裡只負責
 * 「換角色當下」的合理起點。切成 tenant_admin 的話六個開關維持原樣不動
 * ——反正老闆不看這六個開關，getEffectivePermissions() 一律給滿權限。
 */
export async function updateStaffRole(
  targetProfileId: string,
  role: Role
): Promise<StaffActionResult> {
  const check = await assertCanManage(targetProfileId);
  if (!check.ok) return { error: check.error };

  if (!MANAGEABLE_ROLES.includes(role)) {
    return { error: "角色不正確。" };
  }

  const supabase = await createClient();
  const updatePayload: { role: Role } & Partial<StaffPermissionFlags> = { role };
  // 排除 super_admin 只是為了讓 TypeScript 縮小型別（上面的 MANAGEABLE_ROLES
  // 檢查已經在執行期擋掉 super_admin，但 .includes() 不會幫忙縮小型別，
  // 不排除的話 role 在這裡的型別仍然是 "super_admin" | "manager" |
  // "accountant" | "staff"，拿去查 ROLE_DEFAULT_PERMISSIONS 這個只認得
  // 後三種角色的 Record 會被 TypeScript 判定為 TS7053、導致 build 失敗）。
  if (role !== "tenant_admin" && role !== "super_admin") {
    Object.assign(updatePayload, ROLE_DEFAULT_PERMISSIONS[role]);
  }

  const { error } = await supabase.from("profiles").update(updatePayload).eq("id", targetProfileId);

  if (error) {
    return { error: `更新角色失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * 更新單一員工的六個權限細項開關。一次只切換一個開關，所以呼叫端要把
 * 「這個人現在完整的六個值」都帶上（切換那個開關取反、其他維持原樣），
 * 不能只傳被改動的那一個欄位，不然沒被提到的欄位在 Supabase update 裡
 * 會被當成「不變更」，這點呼叫端（settings-module.tsx）已經處理好了。
 */
export async function updateStaffPermissions(
  targetProfileId: string,
  permissions: StaffPermissionFlags
): Promise<StaffActionResult> {
  const check = await assertCanManage(targetProfileId);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      can_view_cost: !!permissions.can_view_cost,
      can_view_salary: !!permissions.can_view_salary,
      can_edit_cars: !!permissions.can_edit_cars,
      can_view_all_salary: !!permissions.can_view_all_salary,
      can_approve_repairs: !!permissions.can_approve_repairs,
      can_manage_finance: !!permissions.can_manage_finance,
      can_view_analytics: !!permissions.can_view_analytics,
    })
    .eq("id", targetProfileId);

  if (error) {
    return { error: `更新權限失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * 車行管理員在「帳號與權限管理」邀請員工加入——公開的 /login 只給老闆
 * 自助註冊（會自動開一間新車行），員工帳號一律要從這裡邀請才能進來，
 * 不能自己跑去 /login 註冊，避免任何人都能自己開帳號進到某間車行。
 *
 * 用 Supabase Admin API 的 inviteUserByEmail() 寄邀請信，員工點連結後
 * 自己在 /auth/set-password 設定密碼——密碼不經過管理員的手，也不用另外
 * 用 LINE/簡訊傳密碼給員工這種不安全的做法。metadata 帶 invited_tenant_id /
 * invited_role，資料庫的 handle_new_user() trigger 收到信箱驗證通過、
 * auth.users 新增那筆資料時，會直接把這個帳號掛進指定的車行、套用指定的
 * 角色，不需要再手動指派（見 supabase_schema.sql 的說明）。
 *
 * 2026-08 補上「重新邀請剛移出的員工」這個情境：inviteUserByEmail() 只認得
 * 「這個 Email 有沒有出現在 auth.users」，完全不知道「這個帳號其實是我
 * 車行剛移出的人，我現在只是想把他加回來」——這種情況下 Supabase 一定
 * 會擋下來（回傳「已經有帳號了，無法重複邀請」），因為帳號本來就還在，
 * 不需要、也不能再寄一次「建立帳號」的邀請信。以前這裡沒處理這個情境，
 * 車行管理員自己按「移出本車行」再馬上想加回來，會直接卡死在這個錯誤，
 * 只能請開發者手動到後台資料庫改。
 * 修法：寄出邀請信之前，先呼叫 restore_staff_to_tenant()——這支資料庫函式
 * 只有在「這個 Email 對應的帳號目前沒有車行、而且上一次剛好就是被我這間
 * 車行移出的」才會生效，直接把他接回來、套用這次表單填的角色/權限，
 * 完全不用、也不會走 Supabase 邀請信那一段（他本來就有密碼，不需要重設）。
 * 其餘情況（全新 Email、或這個 Email 屬於其他車行/其他狀況）一律維持
 * 原本流程，不會讓任何車行都能撿走別的車行的舊員工帳號。
 */
export async function inviteStaffMember(
  _prevState: InviteStaffState | undefined,
  formData: FormData
): Promise<InviteStaffState> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "沒有權限邀請員工，請聯繫車行管理員。" };
  }
  if (!profile.tenant_id) {
    return { error: "找不到您所屬的車行，請重新登入後再試一次。" };
  }

  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "staff").trim();
  const canViewCost = formData.get("can_view_cost") === "on";
  const canViewSalary = formData.get("can_view_salary") === "on";
  const canEditCars = formData.get("can_edit_cars") === "on";
  const canViewAllSalary = formData.get("can_view_all_salary") === "on";
  const canApproveRepairs = formData.get("can_approve_repairs") === "on";
  const canManageFinance = formData.get("can_manage_finance") === "on";
  const canViewAnalytics = formData.get("can_view_analytics") === "on";

  if (!email || !EMAIL_PATTERN.test(email)) {
    return { error: "請輸入正確的 Email 格式。" };
  }
  if (!MANAGEABLE_ROLES.includes(roleRaw as Role)) {
    return { error: "角色不正確。" };
  }
  const role = roleRaw as Role;

  // 先試試看這個 Email 是不是自己車行剛移出過的人——是的話直接接回來，
  // 不要再往下走一般的邀請信流程（見上方函式註解）。
  // restore_staff_to_tenant() 是這次新增的資料庫函式，還沒被收進
  // src/lib/supabase/types.ts 的產生型別（Database）裡，supabase-js 對
  // 不認得的 RPC 名稱只能推斷出空物件型別 {}，直接讀 .name 會在建置時
  // 被 TypeScript 擋下來（型別檢查失敗、not 執行期錯誤）。這裡明確標註
  // 回傳型別，不用等哪天重新產生完整型別檔。
  const supabase = await createClient();
  const { data: restoredRows, error: restoreError } = (await supabase.rpc(
    "restore_staff_to_tenant",
    {
      p_email: email,
      p_role: role,
      p_can_view_cost: canViewCost,
      p_can_view_salary: canViewSalary,
      p_can_edit_cars: canEditCars,
      p_can_view_all_salary: canViewAllSalary,
      p_can_approve_repairs: canApproveRepairs,
      p_can_manage_finance: canManageFinance,
      p_can_view_analytics: canViewAnalytics,
    }
  )) as { data: { id: string; name: string | null }[] | null; error: { message: string } | null };

  if (restoreError) {
    return { error: `處理失敗：${restoreError.message}` };
  }
  const restored = restoredRows?.[0];
  if (restored) {
    revalidatePath("/dashboard");
    return {
      success: `「${restored.name ?? email}」原本就有帳號（是本車行之前移出的成員），已經直接把他加回本車行，不需要重新收邀請信，對方可以直接用原本的 Email／密碼登入。`,
    };
  }

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "邀請功能尚未設定完成。" };
  }

  const siteUrl = await getSiteUrl();
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: {
      invited_tenant_id: profile.tenant_id,
      invited_role: role,
      name: name || undefined,
    },
    redirectTo: `${siteUrl}/auth/confirm`,
  });

  if (error) {
    if (/already.*registered|already.*exists/i.test(error.message)) {
      return { error: "此 Email 已經有帳號了，無法重複邀請。" };
    }
    return { error: `邀請失敗：${error.message}` };
  }
  if (!data.user) {
    return { error: "邀請失敗，請稍後再試。" };
  }

  // 邀請當下順便把表單上勾選的三個權限開關寫進去——trigger 只負責
  // tenant_id/role/name，不知道這三個布林欄位。走一般 client（不是
  // admin client），讓 profiles_tenant_admin_manage 這條 RLS policy
  // 照常把關（租戶邊界、角色限制），不需要為此再繞過 RLS。沒勾選任何一項
  // 就不用多一次寫入，資料庫預設值本來就是全部關閉。
  if (
    canViewCost ||
    canViewSalary ||
    canEditCars ||
    canViewAllSalary ||
    canApproveRepairs ||
    canManageFinance ||
    canViewAnalytics
  ) {
    await supabase
      .from("profiles")
      .update({
        can_view_cost: canViewCost,
        can_view_salary: canViewSalary,
        can_edit_cars: canEditCars,
        can_view_all_salary: canViewAllSalary,
        can_approve_repairs: canApproveRepairs,
        can_manage_finance: canManageFinance,
        can_view_analytics: canViewAnalytics,
      })
      .eq("id", data.user.id);
  }

  revalidatePath("/dashboard");
  return {
    success: `已寄出邀請信給 ${email}，請請對方至信箱收信（記得也看一下垃圾郵件匣）、點連結設定密碼後即可登入。`,
  };
}

/**
 * 「我的公開聯繫方式」自助表單——任何登入的員工（不限管理員）都能改，
 * 只能改自己這一列，不需要另外做權限檢查：走一般 client（不是 admin
 * client），資料庫層的 `profiles_update_self` policy（id = auth.uid()）
 * 本來就只允許改自己的 profile，這裡不用重複判斷角色。
 *
 * show_public_contact 打勾但電話/LINE 兩欄都空白的話擋下來，避免前台
 * 「聯繫我們的業務」區塊出現一張完全沒有聯絡方式可用的空卡片。
 */
export async function updateMyPublicContact(
  _prevState: MyContactState | undefined,
  formData: FormData
): Promise<MyContactState> {
  const { profile } = await requireTenantUser();

  const publicPhone = String(formData.get("public_phone") ?? "").trim();
  const publicLineId = String(formData.get("public_line_id") ?? "").trim();
  const publicBio = String(formData.get("public_bio") ?? "").trim();
  const showPublicContact = formData.get("show_public_contact") === "on";

  if (showPublicContact && !publicPhone && !publicLineId) {
    return { error: "要公開顯示在顧客前台，電話或 LINE 至少要填一項。" };
  }

  const supabase = await createClient();

  const updatePayload: {
    public_phone: string | null;
    public_line_id: string | null;
    public_bio: string | null;
    show_public_contact: boolean;
    public_avatar_url?: string;
  } = {
    public_phone: publicPhone || null,
    public_line_id: publicLineId || null,
    public_bio: publicBio || null,
    show_public_contact: showPublicContact,
  };

  // 大頭照只有真的選了新檔案才上傳並覆蓋 public_avatar_url；沒選就完全
  // 不碰這個欄位，保留原本的照片（跟車行 Logo/車輛照片編輯的邏輯一致，
  // 見 tenant-actions.ts / cars-actions.ts）。
  let avatarWarning: string | undefined;
  const avatar = formData.get("public_avatar");
  if (avatar instanceof File && avatar.size > 0) {
    if (!profile.tenant_id) {
      avatarWarning = "找不到所屬車行，大頭照上傳失敗，其餘資料仍會更新。";
    } else {
      const { url, error: uploadError } = await uploadStaffAvatar(
        supabase,
        profile.tenant_id,
        profile.id,
        avatar
      );
      if (uploadError) {
        console.error(`[updateMyPublicContact] 大頭照上傳失敗（帳號 ${profile.id} 其餘欄位仍會更新）：${uploadError}`);
        avatarWarning = `其他資料已成功更新，但大頭照上傳失敗（${uploadError}），照片維持原樣，請稍後重新嘗試。`;
      } else if (url) {
        updatePayload.public_avatar_url = url;
      }
    }
  }

  const { error } = await supabase.from("profiles").update(updatePayload).eq("id", profile.id);

  if (error) {
    return { error: `更新失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return {
    success: showPublicContact ? "已更新，顧客前台現在看得到你的聯繫方式。" : "已更新（目前設定為不公開）。",
    warning: avatarWarning,
  };
}
