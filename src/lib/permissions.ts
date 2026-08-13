// 角色權限管理（RBAC）與業務權限開關：把「角色」跟 profiles 表裡三個
// 個別權限開關（can_view_cost / can_view_salary / can_edit_cars）合併成
// 一個「實際生效權限」物件，Server Component / Server Action / Client
// Component 一律透過這支函式取得權限，不要直接散落各處判斷 role 字串。
import type { Profile } from "./supabase/types";

export interface EffectivePermissions {
  /** 可以檢視車輛進貨成本、底價等敏感財務欄位。 */
  canViewCost: boolean;
  /** 可以檢視「業務薪資」模組（自己的成交車輛與預估抽成明細）。 */
  canViewSalary: boolean;
  /** 可以新增/編輯車輛資料。 */
  canEditCars: boolean;
  /** 可以管理員工角色與權限（車行管理員專屬，不受個別開關影響）。 */
  canManageStaff: boolean;
}

type PermissionSource = Pick<Profile, "role" | "can_view_cost" | "can_view_salary" | "can_edit_cars">;

/**
 * 車行管理員（tenant_admin）永遠擁有全部權限，不管 profiles 表裡這三個
 * 開關存的是什麼值——這三個開關的設計目的是給「一般業務」個別加開/收回
 * 額外權限用的，不是拿來限制管理員自己。super_admin 理論上不會走到會用
 * 這支函式的頁面（dal.ts 的 requireTenantUser 會把 super_admin 導去
 * /super-admin），但保險起見也一併給滿權限。
 */
export function getEffectivePermissions(profile: PermissionSource): EffectivePermissions {
  if (profile.role === "tenant_admin" || profile.role === "super_admin") {
    return { canViewCost: true, canViewSalary: true, canEditCars: true, canManageStaff: true };
  }
  return {
    canViewCost: profile.can_view_cost,
    canViewSalary: profile.can_view_salary,
    canEditCars: profile.can_edit_cars,
    canManageStaff: false,
  };
}
