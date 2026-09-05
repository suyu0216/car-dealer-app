// 品牌簡介頁「熱門車款」大圖網格的單一格子——不把文字疊在照片上：圖在
// 上、白底資訊卡在下，讓照片保持完整不被打斷，資訊清楚分開放在下面乾淨
// 留白的區塊，像藝廊照片下方的說明牌那樣。價格維持橘紅色（見
// showroom-shell.tsx 的視覺風格說明：跳色只留給價格跟「近期上架」急迫
// 標籤）。
import { carDisplayName, formatCurrency } from "@/lib/format";
import type { ShowroomCar } from "@/lib/supabase/public-cars";
import { FadeImage } from "./fade-image";

export function FeaturedCard({ car, onClick }: { car: ShowroomCar; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-tex-feature group overflow-hidden rounded-2xl border border-[#E5E5E5] bg-white text-left shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#BFA074]/50 hover:shadow-[0_0_0_1px_#BFA074,0_16px_32px_-16px_rgba(191,160,116,0.35)] active:scale-[0.98] active:duration-100"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F5F5F5]">
        {car.image_url ? (
          <FadeImage
            src={car.image_url}
            alt={`${car.brand ?? ""} ${car.model_name}`}
            className="h-full w-full"
            imgClassName="object-cover group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs tracking-widest text-[#A3A3A3]">
            尚無照片
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-sm bg-white/95 px-3 py-1 text-[11px] font-bold tracking-wide text-[#171717] shadow backdrop-blur">
          熱門推薦
        </span>
      </div>
      <div className="p-5">
        {car.brand && (
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#737373]">{car.brand}</p>
        )}
        <h3 className="font-showroom-display mt-1.5 truncate text-lg tracking-wide text-[#171717]">
          {/* 2026-08-31：廠牌已經在上面單獨顯示一次，這裡用 includeBrand:
              false 併入出廠年份、不重複帶廠牌——見 format.ts carDisplayName
              的說明。 */}
          {carDisplayName(car, { includeBrand: false })}
        </h3>
        <div className="mt-3.5 h-px w-full bg-[#E5E5E5]" />
        <p className="font-showroom-display mt-3 text-xl tabular-nums text-[#E8542D]">
          {car.selling_price != null ? formatCurrency(car.selling_price) : "洽詢底價"}
        </p>
      </div>
    </button>
  );
}
