// 給其他 Server Action（新增維修請款、新增公司開銷……）在事件發生後呼叫，
// 寫入一筆後台鈴鐺通知。刻意不是「use server」檔案——這裡的
// createNotification() 不是要給前端表單/按鈕直接呼叫的 Server Action，
// 只在伺服器端的其他 Server Action 內部被呼叫，呼叫端本來就已經自己做過
// requireTenantUser() 驗證了，這裡不重複驗證、也不會被打包進任何客戶端
// bundle、不會意外變成一個外部可直接呼叫的公開端點（這跟 cars-actions.ts
// 裡沒有 export 的 computeClosingFields() 是同一種「內部輔助函式」考量，
// 只是這裡因為要給不同檔案共用，才需要真的 export 出來、放進獨立檔案）。
import { createClient } from "./server";
import type { NotificationType } from "./types";

export async function createNotification(params: {
  tenantId: string;
  type: NotificationType;
  title: string;
  message: string;
  actorName?: string | null;
  link?: string | null;
}) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("notifications").insert({
      tenant_id: params.tenantId,
      type: params.type,
      title: params.title,
      message: params.message,
      actor_name: params.actorName ?? null,
      link: params.link ?? null,
    });
    // 通知寫入失敗只記錄錯誤，不拋出例外——鈴鐺沒收到通知不該讓呼叫端
    // 真正的業務動作（送出請款、新增開銷）跟著失敗，那是兩件事，跟
    // cars-actions.ts 的 syncCarStatusFromDeal() 是同樣的容錯設計。
    if (error) console.error("[createNotification] 寫入通知失敗：", error.message);
  } catch (e) {
    console.error("[createNotification] 建立通知發生未預期錯誤：", e);
  }
}
