"use client";

import { useTransition } from "react";
import { skipOnboarding } from "../tenant-actions";
import { BrandSettingsModule } from "./brand-settings-module";
import { LogoutButton } from "@/app/_components/logout-button";
import { AppTopBar } from "@/app/_components/app-top-bar";
import type { Tenant } from "@/lib/supabase/types";

/**
 * 新車商第一次登入看到的引導畫面：取代整個 /dashboard（不是疊在上面的
 * Modal——見 dashboard/page.tsx 的分流邏輯，同一時間只會渲染這個或
 * DashboardShell 其中一個）。
 *
 * 表單直接重用 BrandSettingsModule，送出成功後 updateTenantProfile()
 * 會把 onboarding_completed 設成 true 並 revalidatePath("/dashboard")，
 * page.tsx 的 Server Component 下一次渲染就會改走 DashboardShell 那個
 * 分支——不需要另外用 client state 手動「關閉」這個畫面。
 */
export function OnboardingWizard({ tenant }: { tenant: Tenant }) {
  const [pending, startTransition] = useTransition();

  function handleSkip() {
    startTransition(async () => {
      await skipOnboarding();
    });
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <AppTopBar />
          <LogoutButton />
        </div>

        <div className="mt-6 text-center">
          <p className="text-3xl" aria-hidden>
            🎉
          </p>
          <h1 className="mt-2 text-xl font-semibold text-neutral-900">歡迎加入！</h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            只要填好基本資料，顧客就能在專屬的線上展間看到「{tenant.name}」的車輛。
          </p>
          {tenant.status === "pending" && (
            <p className="mx-auto mt-4 max-w-md rounded-lg bg-[#FBF3E7] px-3 py-2 text-xs text-[#8A5F24] ring-1 ring-inset ring-[#F0E0C4]">
              💡 你的帳號正在等待平台審核，審核通過後顧客看車頁就會正式對外開放；後台功能現在就可以先開始使用，不用等審核。
            </p>
          )}
        </div>

        <div className="mt-8">
          <BrandSettingsModule tenant={tenant} />
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleSkip}
            disabled={pending}
            className="text-xs text-neutral-400 underline-offset-2 transition hover:text-neutral-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "處理中…" : "稍後再設定，先進入後台"}
          </button>
        </div>
      </div>
    </div>
  );
}
