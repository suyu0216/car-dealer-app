import type { Car, RepairItem } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";

/** 車輛「還沒賣掉」的三種狀態，這個元件只顯示在庫車輛的財務數據 —— 已售出
 *（已結帳）車輛的損益一律在「車行經營數據看板」模組看，兩邊資料來源徹底
 * 分開，不會互相污染或看到兜不起來的數字（見 analytics-module.tsx）。 */
function isInInventory(status: Car["status"]) {
  return status !== "sold";
}

export function CarsKpi({
  cars,
  repairItems,
  canViewCost,
}: {
  cars: Car[];
  repairItems: RepairItem[];
  /** 庫存總成本/預估毛利空間屬於敏感財務資訊，沒有這個權限就整卡遮罩。 */
  canViewCost: boolean;
}) {
  // 場內成本一律用「收購價 + 已核准維修整備費 + 規費 + 稅金」計算，跟每台車
  // 詳情頁的財務損益卡（car-maintenance-tab.tsx）用同一套公式，不再讀舊版
  // 手動填寫的 detailing_cost / repair_cost 欄位（那兩個已經被 repair_items
  // 請款流程取代）。2026-08-30 修正：這裡原本漏加 car.tax_amount（稅金/
  // 發票稅金），跟 car-maintenance-tab.tsx、analytics-module.tsx 是同一批
  // 修正——理由見那兩個檔案裡的說明。
  const approvedPrepCostByCar = new Map<string, number>();
  for (const item of repairItems) {
    if (item.status !== "approved") continue;
    approvedPrepCostByCar.set(
      item.car_id,
      (approvedPrepCostByCar.get(item.car_id) ?? 0) + Number(item.amount)
    );
  }
  const totalCost = (car: Car) =>
    Number(car.purchase_price) +
    (approvedPrepCostByCar.get(car.id) ?? 0) +
    Number(car.transfer_fee ?? 0) +
    Number(car.tax_amount ?? 0);

  const inventoryCars = cars.filter((c) => isInInventory(c.status));
  const inventoryCount = inventoryCars.length;

  const inventoryCost = inventoryCars.reduce((sum, c) => sum + totalCost(c), 0);
  // 2026-08-30：「預估毛利空間」這張卡片依使用者要求拿掉——理由跟
  // analytics-module.tsx 拿掉「場內預估毛利」一樣：車輛都還沒賣出就先用
  // 「假設現在開價全部賣掉」估一個毛利數字，容易被誤讀成已經確定能賺到
  // 的錢，不再計算這個估算值。
  // 2026-08-30：「開價總額」這張卡片依使用者要求也拿掉，同樣不再計算
  // inventoryAskTotal——原因跟「預估毛利空間」一樣：把「還沒賣掉的車全部
  // 開價加總」放在這裡，容易被誤讀成確定能收到的錢。

  return (
    <div className="grid grid-cols-2 gap-3">
      <KpiCard label="在庫車輛總數" value={`${inventoryCount} 輛`} />
      <KpiCard
        label="庫存總成本"
        value={canViewCost ? formatCurrency(inventoryCost) : "🔒 權限不足"}
        sub={canViewCost ? "收購+已核准整備費+規費+稅金" : undefined}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-neutral-500">{label}</p>
      <p
        className={
          "mt-1.5 text-xl font-semibold tabular-nums " +
          (tone === "positive"
            ? "text-[#5F7563]"
            : tone === "negative"
              ? "text-red-600"
              : "text-neutral-800")
        }
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-neutral-400">{sub}</p>}
    </div>
  );
}
