/** 車行已完成 Onboarding、但 Super Admin 還沒核准（status = 'pending'）時
 * 顯示在後台頁首的提示條——後台功能正常可用，只有前台展間還沒對外開放。 */
export function PendingApprovalBanner() {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#F0E0C4] bg-[#FBF3E7] px-4 py-2.5 text-sm text-[#8A5F24]">
      <span aria-hidden>⏳</span>
      <p>
        你的車行正在等待平台審核，審核通過後顧客看車頁（/inventory）才會正式對外開放。後台功能不受影響，可以正常使用。
      </p>
    </div>
  );
}
