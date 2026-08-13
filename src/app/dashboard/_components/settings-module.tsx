"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type StaffAccount = {
  id: string;
  name: string | null;
  role: string;
  can_view_cost?: boolean;
  can_view_salary?: boolean;
  can_edit_cars?: boolean;
};

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

    const confirmMsg =
      staff.role === "super_admin"
        ? `確定要把最高管理者「${staff.name ?? "使用者"}」移出本車行嗎？（全平台帳號不會消失，僅解除與捷恒汽車的連結）`
        : `確定要把「${staff.name ?? "員工"}」移出本車行嗎？`;

    if (!confirm(confirmMsg)) return;

    setDeletingId(staff.id);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          tenant_id: null,
          can_view_cost: false,
          can_view_salary: false,
          can_edit_cars: false
        })
        .eq("id", staff.id);

      if (error) throw error;

      setList((prev) => prev.filter((item) => item.id !== staff.id));
      router.refresh();
      alert(`已成功將 ${staff.name ?? "該帳號"} 移出車行名單！`);
    } catch (err: any) {
      alert("移除失敗：" + (err.message || "發生未知錯誤"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="border-b border-neutral-100 pb-4">
        <h2 className="text-lg font-bold text-neutral-900">帳號與權限管理</h2>
        <p className="mt-1 text-xs text-neutral-500">
          若有非本車行的最高管理者或離職員工，請點選「移出本車行」解除連結。
        </p>
      </div>

      <div className="mt-4 divide-y divide-neutral-100">
        {list.map((staff) => {
          const isSelf = staff.id === currentUserId;
          const isSuperAdmin = staff.role === "super_admin";

          return (
            <div key={staff.id} className="flex items-center justify-between py-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-neutral-900">
                    {staff.name ?? "未命名同仁"}
                  </span>
                  {isSuperAdmin && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      平台最高管理者
                    </span>
                  )}
                  {isSelf && (
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                      目前登入 (你自己)
                    </span>
                  )}
                </div>
              </div>

              <div>
                {!isSelf ? (
                  <button
                    type="button"
                    disabled={deletingId === staff.id}
                    onClick={() => handleRemoveStaff(staff)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    {deletingId === staff.id ? "處理中..." : "🗑️ 移出本車行"}
                  </button>
                ) : (
                  <span className="text-xs text-neutral-400">無法移除自己</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
