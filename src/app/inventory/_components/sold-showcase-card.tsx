// 「成交案件」頁的單一展示卡——刻意做得比 FeaturedCard 更小、更低調
// （灰底卡片、圖片加一層淡淡的黑色遮罩＋「已成功交車」浮水印字樣），
// 讓顧客清楚知道這些是已經賣掉的車，不會誤以為還買得到、點下去卻發現
// 只是舊資料。不可點擊（沒有詳情 Modal），純展示用途。
import type { ShowroomCar } from "@/lib/supabase/public-cars";

export function SoldShowcaseCard({ car }: { car: ShowroomCar }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E5E5] bg-white text-left shadow-sm">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#E5E5E5]">
        {car.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 見 showroom-lightbox.tsx 的說明
          <img
            src={car.image_url}
            alt={`${car.brand ?? ""} ${car.model_name}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover opacity-80"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs tracking-widest text-[#A3A3A3]">
            尚無照片
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/35">
          <span className="rounded-sm bg-white/95 px-2.5 py-1 text-[11px] font-bold tracking-wide text-[#171717]">
            已成功交車
          </span>
        </div>
      </div>
      <div className="p-3">
        {car.brand && (
          <p className="truncate text-[10px] uppercase tracking-[0.15em] text-[#A3A3A3]">{car.brand}</p>
        )}
        <p className="mt-0.5 truncate text-sm font-medium text-[#404040]">{car.model_name}</p>
      </div>
    </div>
  );
}
