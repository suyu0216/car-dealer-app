// /inventory 五個展間頁面共用的空狀態畫面——找不到車行／車行尚未開放／
// 網址沒帶 tenant 參數，三種情況共用同一個畫面，訊息文字由呼叫端（見
// public-tenant.ts 的 loadShowroomTenant()）決定。
export function ShowroomEmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-6 text-center">
      <div>
        <div className="mx-auto h-px w-10 bg-[#D4D4D4]" aria-hidden />
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-[#737373]">{message}</p>
      </div>
    </div>
  );
}
