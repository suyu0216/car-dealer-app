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

    const confirmMsg = `確定要把「${staff.name ?? "此帳號"}」移出捷恒汽車名單嗎？（將解除與本車行的連結）`;
    if (!confirm(confirmMsg)) return;

    setDeletingId(staff.id);

    try {
      // 2026-08 修正：這裡原本直接對 profiles 下 .update({ tenant_id: null, ... })，
      // 不管哪個車行的管理員操作都一定會失敗。根本原因分兩層：
      // 1) RLS policy／trigger 原本都要求「改完之後 tenant_id 還是要等於
      //    管理員自己的 tenant_id」，這跟「移出本車行＝把 tenant_id 改成
      //    null」互相矛盾（這兩層都已經直接在資料庫修好）。
      // 2) 更深層的原因：就算 1) 修好了，PostgreSQL 對 UPDATE 的 RLS
      //    還有一條內建規則——「改完之後的新資料列，必須還能通過資料表上
      //    其他 SELECT policy 的檢查」，否則照樣擋下來。但「移出本車行」
      //    的目的正是讓這筆資料在任何 SELECT policy 底下都不再可見（不屬於
      //    任何車行），這條內建規則跟這個操作的本質互相矛盾，沒辦法單靠
      //    調整 RLS policy 解決，又不能為了繞過它而放寬 SELECT
      //    policy——那樣會變成任何車行的管理員都能查到「全平台」被移出過
      //    的員工名單，造成跨車行資料外洩。
      // 改成呼叫資料庫裡一個專門的 SECURITY DEFINER 函式
      // （remove_staff_from_tenant，見 supabase_schema.sql）——函式內部
      // 不受呼叫者的 RLS 限制，改成在函式自己的程式邏輯裡明確檢查權限
      // （必須是 tenant_admin、不能對自己動手、目標必須屬於自己車行），
      // 檢查嚴謹程度不輸 RLS，只是用程式碼明確表達。
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
          若有非本車行的管理者或離職員工，請點選「移出本車行」解除連結。
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
