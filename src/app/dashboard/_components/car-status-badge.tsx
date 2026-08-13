import type { Car } from "@/lib/supabase/types";

export const STATUS_LABEL: Record<Car["status"], string> = {
  preparing: "整備中",
  in_stock: "待售中",
  reserved: "已預訂",
  sold: "已售出",
};

// 韓系極簡的柔和莫蘭迪色系：Soft Slate（整備）／莫蘭迪綠（待售）／
// 柔和奶茶金（已預訂）／沉穩深灰（已售出），淺底深字，不刺眼。
const STATUS_STYLE: Record<Car["status"], string> = {
  preparing: "bg-[#EEF1F4] text-[#5B6B7A] ring-[#DCE3E9]",
  in_stock: "bg-[#EEF2ED] text-[#5F7563] ring-[#D9E2D6]",
  reserved: "bg-[#FBF3E7] text-[#A6793D] ring-[#F0E0C4]",
  sold: "bg-[#F1F0EE] text-[#57534E] ring-[#E2DFDA]",
};

export const STATUS_OPTIONS: Car["status"][] = ["preparing", "in_stock", "reserved", "sold"];

export function CarStatusBadge({
  status,
  className = "",
}: {
  status: Car["status"];
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]} ${className}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
