"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  inviteStaffMember,
  updateStaffPermissions,
  updateStaffRole,
  type InviteStaffState,
  type StaffPermissionFlags,
} from "../staff-actions";
import { ROLE_DEFAULT_PERMISSIONS, ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@/lib/supabase/types";

export type StaffAccount = {
  id: string;
  name: string | null;
  role: string;
} & Partial<StaffPermissionFlags>;

/** 帳號與權限管理頁可指派的四個角色，跟 staff-actions.ts 的
 * MANAGEABLE_ROLES 一致（super_admin 不會出現在這個列表）。 */
const ASSIGNABLE_ROLES: Extract<Role, "tenant_admin" | "manager" | "accountant" | "staff">[] = [
  "tenant_admin",
  "manager",
  "accountant",
  "staff",
];

const PERMISSION_FIELDS: {
  key: keyof StaffPermissionFlags;
  label: string;
}[] = [
  { key: "can_view_cost", label: "檢視成本與底價" },
  { key: "can_edit_cars", label: "編輯車輛資料" },
  { key: "can_view_salary", label: "檢視自己的薪資" },
  { key: "can_view_all_salary", label: "檢視全體薪資（不只自己）" },
  { key: "can_approve_repairs", label: "審核維修/請款" },
  { key: "can_manage_finance", label: "管理財務（公司開銷/資金總覽/分潤）" },
];

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

export function SettingsModule({
  staffAccounts,
  currentUserId,
}: {
  staffAccounts: StaffAccount[];
  currentUserId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [list, setList] = useState<StaffAccount[]>(staffAccounts);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setList(staffAccounts);
  }, [staffAccounts]);

  const handleRemoveStaff = async (staff: StaffAccount) => {
    if (staff.id === currentUserId) {
      alert("你無法移除自己的帳號！");
      return;
    }

    const confirmMsg = `確定要把「${staff.name ?? "此帳號"}」移出本車行嗎？（將解除與本車行的連結）`;
    if (!confirm(confirmMsg)) return;

    setDeletingId(staff.id);

    try {
      const { error } = await supabase.rpc("remove_staff_from_tenant", {
        target_id: staff.id,
      });

      if (error) {
        console.error("Supabase Error:", error);
        throw new Error(error.message || "資料庫權限不足或更新失敗");
      }

      setList((prev) => prev.filter((item) => item.id !== staff.id));
      router.refresh();
      alert(`已成功將 ${staff.name ?? "該帳號"} 移出車行！`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "發生未知錯誤";
      alert("移除失敗：" + message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <InviteStaffForm />

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="border-b border-neutral-100 pb-4">
          <h2 className="text-lg font-bold text-neutral-900">帳號與權限管理</h2>
          <p className="mt-1 text-xs text-neutral-500">
            可以調整每位員工的角色跟權限——角色（老闆／店長／會計／員工）決定切換當下的預設權限組合，切換完之後仍然可以針對這個人再個別微調下面的權限開關。若有非本車行的管理者或離職員工，請點選「移出本車行」解除連結。
          </p>
        </div>

        <div className="mt-4 divide-y divide-neutral-100">
          {list.map((staff) => (
            <StaffRow
              key={staff.id}
              staff={staff}
              isSelf={staff.id === currentUserId}
              isDeleting={deletingId === staff.id}
              onRemove={() => handleRemoveStaff(staff)}
              onLocalUpdate={(patch) =>
                setList((prev) => prev.map((s) => (s.id === staff.id ? { ...s, ...patch } : s)))
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const inviteInitialState: InviteStaffState = {};

const EMPTY_PERMISSIONS: StaffPermissionFlags = {
  can_view_cost: false,
  can_view_salary: false,
  can_edit_cars: false,
  can_view_all_salary: false,
  can_approve_repairs: false,
  can_manage_finance: false,
};

/** 邀請新員工——輸入 Email + 指定角色/權限，系統寄邀請信，員工自己點連結
 * 設定密碼。公開的 /login 只給老闆自助註冊（會自動開一間新車行），員工
 * 一律要從這裡邀請才能拿到帳號，不能自己跑去 /login 註冊進來。
 *
 * 2026-08-29：角色下拉選單改成四選一（老闆/店長/會計/員工），選了角色
 * 之後下面六個權限勾選框會自動套用該角色的預設組合（見
 * ROLE_DEFAULT_PERMISSIONS），管理員在送出前仍然可以自己再調整勾選框，
 * 送出時實際帶的是勾選框當下的狀態，不是角色本身。
 */
function InviteStaffForm() {
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [state, formAction, pending] = useActionState(inviteStaffMember, inviteInitialState);
  const [role, setRole] = useState<Role>("staff");
  const [permissions, setPermissions] = useState<StaffPermissionFlags>(ROLE_DEFAULT_PERMISSIONS.staff);

  useEffect(() => {
    if (state?.success) {
      setResetKey((k) => k + 1);
      setRole("staff");
      setPermissions(ROLE_DEFAULT_PERMISSIONS.staff);
    }
  }, [state]);

  function handleRoleChange(next: Role) {
    setRole(next);
    setPermissions(next === "tenant_admin" ? EMPTY_PERMISSIONS : ROLE_DEFAULT_PERMISSIONS[next]);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[#BFA074] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#AD9066]"
      >
        + 邀請員工
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
        <h2 className="text-base font-semibold text-neutral-800">邀請員工</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-400 hover:text-neutral-700">
          收起
        </button>
      </div>

      <form key={resetKey} action={formAction} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700">員工 Email</label>
            <input
              name="email"
              type="email"
              required
              placeholder="employee@example.com"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">姓名（選填）</label>
            <input name="name" placeholder="員工姓名" className={INPUT_CLASS} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">角色</label>
          <select
            name="role"
            value={role}
            onChange={(e) => handleRoleChange(e.target.value as Role)}
            className={INPUT_CLASS}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-sm font-medium text-neutral-700">
            權限（已依角色帶入常用預設，可再自行調整）
          </p>
          {role === "tenant_admin" ? (
            <p className="mt-1.5 text-xs text-neutral-400">老闆一律擁有全部權限，不需要另外勾選。</p>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-4">
              {PERMISSION_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-sm text-neutral-600">
                  <input
                    type="checkbox"
                    name={f.key}
                    checked={permissions[f.key]}
                    onChange={(e) =>
                      setPermissions((prev) => ({ ...prev, [f.key]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-neutral-300"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          )}
        </div>

        {state?.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="rounded-lg bg-[#EEF2ED] px-3 py-2 text-sm text-[#5F7563]">{state.success}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "寄送邀請中…" : "寄出邀請信"}
          </button>
        </div>
      </form>
    </section>
  );
}

function StaffRow({
  staff,
  isSelf,
  isDeleting,
  onRemove,
  onLocalUpdate,
}: {
  staff: StaffAccount;
  isSelf: boolean;
  isDeleting: boolean;
  onRemove: () => void;
  onLocalUpdate: (patch: Partial<StaffAccount>) => void;
}) {
  const isSuperAdmin = staff.role === "super_admin";
  // 自己、跟平台最高管理者這兩種身分不能在這裡被調整角色/權限——自己
  // 改自己在 Server Action 那層也會被擋（見 staff-actions.ts 的
  // assertCanManage），這裡先把控制項整個關掉，不用等送出才收到錯誤。
  const canManage = !isSelf && !isSuperAdmin;
  const isOwner = staff.role === "tenant_admin";

  const [roleError, setRoleError] = useState<string | null>(null);
  const [permError, setPermError] = useState<string | null>(null);
  const [, startRoleTransition] = useTransition();
  const [, startPermTransition] = useTransition();

  function handleRoleChange(role: Role) {
    const prev = { ...staff };
    // 樂觀更新：角色跟六個權限開關一起改成新角色的預設值，跟
    // staff-actions.ts 的 updateStaffRole() 伺服器端行為一致，畫面才不會
    // 在 revalidatePath 重新整理前顯示「角色已改，但權限勾選還是舊的」
    // 這種不一致的過渡畫面。
    const nextPermissions = role === "tenant_admin" ? {} : ROLE_DEFAULT_PERMISSIONS[role];
    onLocalUpdate({ role, ...nextPermissions });
    startRoleTransition(async () => {
      const result = await updateStaffRole(staff.id, role);
      if (result?.error) {
        setRoleError(result.error);
        onLocalUpdate(prev);
      } else {
        setRoleError(null);
      }
    });
  }

  function handlePermissionToggle(key: keyof StaffPermissionFlags) {
    const next: StaffPermissionFlags = {
      can_view_cost: !!staff.can_view_cost,
      can_view_salary: !!staff.can_view_salary,
      can_edit_cars: !!staff.can_edit_cars,
      can_view_all_salary: !!staff.can_view_all_salary,
      can_approve_repairs: !!staff.can_approve_repairs,
      can_manage_finance: !!staff.can_manage_finance,
      [key]: !staff[key],
    };
    const prev = { ...staff };
    onLocalUpdate(next);
    startPermTransition(async () => {
      const result = await updateStaffPermissions(staff.id, next);
      if (result?.error) {
        setPermError(result.error);
        onLocalUpdate(prev);
      } else {
        setPermError(null);
      }
    });
  }

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-neutral-900">{staff.name ?? "未命名同仁"}</span>
            {isSuperAdmin && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                平台最高管理者
              </span>
            )}
            {isSelf && (
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                目前登入（你自己）
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManage ? (
            <select
              value={staff.role}
              onChange={(e) => handleRoleChange(e.target.value as Role)}
              className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700 outline-none focus:border-[#BFA074]"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-neutral-400">
              {isSuperAdmin ? "平台最高管理者" : ROLE_LABELS[staff.role as Exclude<Role, "super_admin">]}
            </span>
          )}

          {!isSelf ? (
            <button
              type="button"
              disabled={isDeleting}
              onClick={onRemove}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-red-700 disabled:opacity-50 transition"
            >
              {isDeleting ? "處理中..." : "🗑️ 移出本車行"}
            </button>
          ) : (
            <span className="text-xs text-neutral-400">無法移除自己</span>
          )}
        </div>
      </div>

      {canManage && !isOwner && (
        <div className="mt-2 flex flex-wrap gap-4">
          {PERMISSION_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-1.5 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={!!staff[f.key]}
                onChange={() => handlePermissionToggle(f.key)}
                className="h-3.5 w-3.5 rounded border-neutral-300"
              />
              {f.label}
            </label>
          ))}
        </div>
      )}
      {canManage && isOwner && (
        <p className="mt-2 text-xs text-neutral-400">老闆一律擁有全部權限，不需要另外勾選。</p>
      )}

      {(roleError || permError) && (
        <p className="mt-1.5 text-xs text-red-600">{roleError ?? permError}</p>
      )}
    </div>
  );
}
