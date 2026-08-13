import { APP_NAME } from "@/lib/config";

/**
 * 產品品牌小標，跟「使用者自己的車行名稱」是分開的兩件事：
 * 這裡永遠顯示通用產品名稱，登入後頁面的主標題（見 dashboard / super-admin
 * page.tsx）才顯示 tenants.name，達成多租戶視覺隔離。
 */
export function AppTopBar() {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-xs font-medium tracking-wide text-neutral-400 dark:text-neutral-600">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-600" />
      {APP_NAME}
    </div>
  );
}
