import type { Car } from "@/lib/supabase/types";

/** 在庫天數：從建立（收購入庫）時間到現在的天數。已售出的車輛不計算在庫天數。 */
export function agingDays(car: Car): number | null {
  if (car.status === "sold") return null;
  const created = new Date(car.created_at).getTime();
  if (Number.isNaN(created)) return null;
  return Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
}

/** 超過 30 天柔和黃色警示、超過 45 天柔和紅色警示，30 天內不顯示（避免畫面雜訊）。 */
export function CarAgingBadge({ car, className = "" }: { car: Car; className?: string }) {
  const days = agingDays(car);
  if (days == null || days < 30) return null;

  const isSevere = days >= 45;

  return (
    <span
      className={
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset " +
        (isSevere
          ? "bg-[#FBEAEA] text-[#B75454] ring-[#F0D3D3]"
          : "bg-[#FBF1E4] text-[#B4813E] ring-[#F0DFC0]") +
        (className ? ` ${className}` : "")
      }
    >
      在庫 {days} 天
    </span>
  );
}
