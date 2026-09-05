// 角色權限管理（RBAC）與業務權限開關：把「角色」跟 profiles 表裡的
// 個別權限開關合併成一個「實際生效權限」物件，Server Component / Server
// Action / Client Component 一律透過這支函式取得權限，不要直接散落各處
// 判斷 role 字串。
//
// 2026-08-29：從「車行管理員 / 一般員工」兩級，擴充成「老闆／會計／店長／
// 員工」四級（方案二：角色決定預設權限＋個人化微調）——
//   - 角色（role）只負責兩件事：(1) 決定邀請新員工／切換某人角色的當下，
//     權限開關要預設打開哪些（見下面 ROLE_DEFAULT_PERMISSIONS）；
//     (2) canManageStaff（帳號與權限管理／品牌設定）恆定只有老闆
//     （tenant_admin）才有，不開放個別微調，避免權限提升風險。
//   - 除了 canManageStaff 之外，其餘權限的「實際生效值」一律直接讀
//     profiles 表對應的布林欄位，不是看角色字串——老闆事後隨時可以在
//     「帳號與權限管理」頁針對某個人再打開/關掉單一項目，不受角色綁死。
//
// 2026-08-29 追加：「檢視車行經營數據看板」（can_view_analytics）原本是
// 跟 can_view_cost 綁在一起的——只要看得到成本，就會自動看得到經營數據
// 看板，兩者沒辦法分開勾選。使用者反映這造成困惑（例如店長預設看得到
// 成本，就會連帶看到經營數據看板，即使老闆並沒有刻意要給他這個看板），
// 所以拆成獨立欄位，兩者可以分開勾選、互不影響。
import type { Profile } from "./supabase/types";

export interface EffectivePermissions {
  /** 可以檢視車輛進貨成本、底價等敏感財務欄位。 */
  canViewCost: boolean;
  /** 可以檢視「業務薪資」/「薪資單」模組（自己的成交車輛與抽成/底薪明細）。 */
  canViewSalary: boolean;
  /** 可以新增/編輯車輛資料。 */
  canEditCars: boolean;
  /** 可以在「業務薪資」/「薪資單」看到全體員工的明細，不是只有自己的。 */
  canViewAllSalary: boolean;
  /** 可以審核（核准/退回）維修與美容請款。 */
  canApproveRepairs: boolean;
  /** 可以使用「會計與財務管理」頁面（公司開銷、資金總覽、淨利分潤試算）。 */
  canManageFinance: boolean;
  /** 可以檢視「車行經營數據看板」（場內在庫狀況、本月銷售績效、業務
   * 排行榜、年度整備開銷趨勢）。跟 canViewCost 是各自獨立的兩個開關，
   * 不會互相牽動。 */
  canViewAnalytics: boolean;
  /** 可以管理員工角色與權限（老闆專屬，不受個別開關影響）。 */
  canManageStaff: boolean;
  /**
   * 2026-08-31 新增：可以檢視車輛的「最終成本價格」——比 canViewCost 更
   * 嚴格的獨立權限。安安反映「收購進價」有時候會刻意墊高（跟業務/店長
   * 揭露的成本不是真實成本），需要另一個只有會計/老闆看得到的真實成本
   * 欄位，即使某人有 canViewCost（例如預設看得到成本的店長），一樣看
   * 不到這個欄位。
   *
   * 這個權限固定綁角色（accountant / tenant_admin），不像其他六個權限
   * 開關可以在「帳號與權限管理」個別微調——這個功能存在的目的就是防止
   * 「有成本檢視權限的人」也看到真實成本，如果又能個別開放給店長/員工，
   * 會直接違背安安的原始需求，所以這裡不接 profiles 表的個別欄位，純粹
   * 用角色判斷。
   */
  canViewFinalCost: boolean;
}

type PermissionSource = Pick<
  Profile,
  | "role"
  | "can_view_cost"
  | "can_view_salary"
  | "can_edit_cars"
  | "can_view_all_salary"
  | "can_approve_repairs"
  | "can_manage_finance"
  | "can_view_analytics"
>;

/**
 * 老闆（tenant_admin）永遠擁有全部權限，不管 profiles 表裡這些開關存
 * 的是什麼值——這些開關的設計目的是給「會計／店長／員工」個別加開/
 * 收回額外權限用的，不是拿來限制老闆自己。super_admin 理論上不會走到會
 * 用這支函式的頁面（dal.ts 的 requireTenantUser 會把 super_admin 導去
 * /super-admin），但保險起見也一併給滿權限。
 */
export function getEffectivePermissions(profile: PermissionSource): EffectivePermissions {
  if (profile.role === "tenant_admin" || profile.role === "super_admin") {
    return {
      canViewCost: true,
      canViewSalary: true,
      canEditCars: true,
      canViewAllSalary: true,
      canApproveRepairs: true,
      canManageFinance: true,
      canViewAnalytics: true,
      canManageStaff: true,
      canViewFinalCost: true,
    };
  }
  return {
    canViewCost: profile.can_view_cost,
    canViewSalary: profile.can_view_salary,
    canEditCars: profile.can_edit_cars,
    canViewAllSalary: profile.can_view_all_salary,
    canApproveRepairs: profile.can_approve_repairs,
    canManageFinance: profile.can_manage_finance,
    canViewAnalytics: profile.can_view_analytics,
    canManageStaff: false,
    canViewFinalCost: profile.role === "accountant",
  };
}

/** 「帳號與權限管理」頁面顯示用的角色中文標籤，跟 Role 型別的四個
 * 可指派值（super_admin 不會出現在這個對照表——那是平台層級的身分，
 * 不會在單一車行的員工列表裡出現/被指派）一一對應。 */
export const ROLE_LABELS: Record<"tenant_admin" | "manager" | "accountant" | "staff", string> = {
  tenant_admin: "老闆",
  manager: "店長",
  accountant: "會計",
  staff: "員工",
};

/** 權限開關的角色預設值——邀請新員工／在「帳號與權限管理」把某人
 * 切換到這個角色時，套用這組預設值，之後老闆還能再針對這個人個別微調，
 * 不受這裡的預設值綁死。老闆（tenant_admin）沒有列在這裡——老闆一律
 * getEffectivePermissions() 全部給 true，這些開關對老闆沒有意義。 */
export const ROLE_DEFAULT_PERMISSIONS: Record<
  "manager" | "accountant" | "staff",
  {
    can_view_cost: boolean;
    can_view_salary: boolean;
    can_edit_cars: boolean;
    can_view_all_salary: boolean;
    can_approve_repairs: boolean;
    can_manage_finance: boolean;
    can_view_analytics: boolean;
  }
> = {
  // 店長：日常門市營運負責人——預設看得到成本、能編輯車輛資料、也看得到
  // 經營數據看板，但預設看不到別人的薪資、不能審核請款、不碰財務頁面
  // （這三項比較敏感，老闆可以視情況再個別打開）。
  manager: {
    can_view_cost: true,
    can_view_salary: true,
    can_edit_cars: true,
    can_view_all_salary: false,
    can_approve_repairs: false,
    can_manage_finance: false,
    can_view_analytics: true,
  },
  // 會計：預設可以審核請款、看全體薪資、使用財務管理頁面、看經營數據
  // 看板（這就是原本 repair-items-actions.ts 註解講的「扮演會計角色」），
  // 但預設不編輯車輛資料——一般不屬於會計的工作範圍。
  accountant: {
    can_view_cost: true,
    can_view_salary: true,
    can_edit_cars: false,
    can_view_all_salary: true,
    can_approve_repairs: true,
    can_manage_finance: true,
    can_view_analytics: true,
  },
  // 員工：一般業務——維持這次改版之前的既有預設值，只看得到自己的薪資/
  // 抽成，看不到成本、也看不到經營數據看板，其餘權限一律關閉。
  staff: {
    can_view_cost: false,
    can_view_salary: true,
    can_edit_cars: true,
    can_view_all_salary: false,
    can_approve_repairs: false,
    can_manage_finance: false,
    can_view_analytics: false,
  },
};
