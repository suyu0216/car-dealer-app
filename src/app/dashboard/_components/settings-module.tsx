"use client";

import { useState, useTransition } from "react";
import type { Role } from "@/lib/supabase/types";
import { updateStaffPermissions, updateStaffRole } from "../staff-actions";

export interface StaffAccount {
  id: string;
  name: string | null;
  role: Role;
  can_view_cost: boolean;
  can_view_salary: boolean;
  can_edit_cars: boolean;
}

export function SettingsModule({
  staffAccounts,
  currentUserId,
}: {
  staffAccounts: StaffAccount[];
  currentUserId: string;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-neutral-800">帳號與權限管理</h2>
      <p className="mt-0.5 text-xs text-neutral-400">
        管理員（Admin）永遠擁有全站最高權限，下列開關只對「一般業務」有效。
      </p>

      <div className="mt-4 space-y-3">
        {staffAccounts.length === 0 && (
          <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
            目前沒有其他帳號
          </p>
        )}
        {staffAccounts.map((account) => (
          <StaffRow key={account.id} account={account} isSelf={account.id === currentUserId} />
        ))}
      </div>
    </section>
  );
}

function StaffRow({ account, isSelf }: { account: StaffAccount; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAdmin = account.role === "tenant_admin";
  const disabled = isSelf || pending;

  function handleRoleChange(role: Role) {
    setError(null);
    startTransition(async () => {
      const result = await updateStaffRole(account.id, role);
      if (result?.error) setError(result.error);
    });
  }

  function handleToggle(
    key: "can_view_cost" | "can_view_salary" | "can_edit_cars",
    value: boolean
  ) {
    setError(null);
    startTransition(async () => {
      const result = await updateStaffPermissions(account.id, {
        can_view_cost: key === "can_view_cost" ? value : account.can_view_cost,
        can_view_salary: key === "can_view_salary" ? value : account.can_view_salary,
        can_edit_cars: key === "can_edit_cars" ? value : account.can_edit_cars,
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-neutral-800">
          {account.name ?? "（未命名帳號）"}
          {isSelf && <span className="ml-1.5 text-xs text-neutral-400">（你自己）</span>}
        </p>

        <select
          value={account.role}
          disabled={disabled}
          onChange={(e) => handleRoleChange(e.target.value as Role)}
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-medium text-neutral-700 outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="tenant_admin">管理員 Admin</option>
          <option value="staff">一般業務 Sales</option>
        </select>
      </div>

      {isAdmin ? (
        <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-400">
          管理員擁有全站最高權限，下列開關不適用。
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-100 pt-3">
          <PermissionToggle
            label="檢視車輛進貨成本與底價"
            checked={account.can_view_cost}
            disabled={disabled}
            onChange={(v) => handleToggle("can_view_cost", v)}
          />
          <PermissionToggle
            label="檢視個人薪水報表"
            checked={account.can_view_salary}
            disabled={disabled}
            onChange={(v) => handleToggle("can_view_salary", v)}
          />
          <PermissionToggle
            label="新增/編輯車輛資料"
            checked={account.can_edit_cars}
            disabled={disabled}
            onChange={(v) => handleToggle("can_edit_cars", v)}
          />
        </div>
      )}

      {isSelf && (
        <p className="mt-2 text-xs text-neutral-400">
          無法在這裡調整自己的角色/權限，請請另一位管理員協助。
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 ring-1 ring-inset ring-red-100">
          {error}
        </p>
      )}
    </div>
  );
}

function PermissionToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-600">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={
          "relative h-5 w-9 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 " +
          (checked ? "bg-[#BFA074]" : "bg-neutral-200")
        }
      >
        <span
          className={
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform " +
            (checked ? "translate-x-4" : "translate-x-0")
          }
        />
      </button>
      {label}
    </label>
  );
}
