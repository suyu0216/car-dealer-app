"use client";

import { useState, useTransition } from "react";
import type { Car, RepairItem, RepairItemCategory } from "@/lib/supabase/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { CarStatusBadge, STATUS_LABEL, STATUS_OPTIONS } from "./car-status-badge";
import { CarAgingBadge } from "./car-aging-badge";
import { CarMaintenanceTab } from "./car-maintenance-tab";
import { deleteCar, updateCarStatus } from "../cars-actions";

// 狀態切換的快捷用語，比直接顯示英文/籠統的中文更貼近實際操作情境。
const QUICK_ACTION_LABEL: Record<Car["status"], string> = {
  preparing: "退回整備中",
  in_stock: "整備完成上架",
  reserved: "設為已預訂",
  sold: "設為已售出",
};

export function CarDetailModal({
  car,
  canReview,
  canViewCost,
  canViewCommission,
  canViewFinalCost,
  canEditCars,
  tenantName,
  repairItems,
  receiptUrls,
  staff,
  onClose,
  onEdit,
}: {
  car: Car;
  /** 是否能核准/退回維修請款——見 car-maintenance-tab.tsx 的
   * CarMaintenanceTab，2026-08-29 起改用 canApproveRepairs 權限開關判斷，
   * 不再是只認「是不是老闆」的 role === "tenant_admin"。 */
  canReview: boolean;
  /** 收購進價/過戶費/整理美容/整備維修/底價/最終成交價都算敏感成本資訊。 */
  canViewCost: boolean;
  /** 2026-08-30 新增：這輛車已結帳封存的「業務抽成」（closed_commission_cost）
   * 本質上是某位業務同仁的薪資資訊，不能只靠 canViewCost 就看得到——
   * 預設會看得到成本的店長、或被個別開放 canViewCost 的一般員工，都不該
   * 因此連帶看到別人的抽成。這裡改成獨立的權限開關，只有「看得到全體
   * 薪資」（canViewAllSalary）或「會計/財務管理」（canManageFinance）
   * 才會是 true（見 cars-manager.tsx 怎麼算這個值）。canViewCost 是
   * 「能不能看成本結構這個區塊」，canViewCommission 是「這個區塊裡的
   * 抽成金額能不能再進一步看到」，兩者互相獨立，缺一都看不到。 */
  canViewCommission: boolean;
  /** 2026-08-31 新增：可以檢視「最終成本價格」——比 canViewCost 更嚴格，
   * 預設只有會計/老闆看得到，即使有 canViewCost 也不例外，見
   * permissions.ts 對 canViewFinalCost 的說明。 */
  canViewFinalCost: boolean;
  canEditCars: boolean;
  tenantName?: string;
  repairItems: RepairItem[];
  receiptUrls: Record<string, string>;
  /** 給「上架人」顯示、跟傳給「維修請款與會計」分頁的「墊款業務/經手人」
   * 下拉選單用。 */
  staff: { id: string; name: string | null }[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState<"info" | "maintenance">("info");
  const [pending, startTransition] = useTransition();
  const tags = (car.equipment_tags ?? "")
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
  // 上架人／採購業務：對照員工清單把 profiles.id 換成名字顯示；找不到
  // （例如那位同仁已經被移出車行）就顯示「（帳號已移除）」。上架人是新增
  // 當下自動寫入、不能改；採購業務是「進貨付款追蹤」表單裡可以隨時編輯
  // 的欄位，兩者是不同的人也很正常（例如業務跑去收購、行政人員幫忙上架）。
  const createdByName = car.created_by
    ? (staff.find((s) => s.id === car.created_by)?.name ?? "（帳號已移除）")
    : null;
  const purchasedByName = car.purchased_by
    ? (staff.find((s) => s.id === car.purchased_by)?.name ?? "（帳號已移除）")
    : null;

  // 整備維修成本／整理美容成本一律用「維修請款與會計」分頁裡已核准撥款
  // 的請款紀錄依類別即時加總，不再讀車輛表單那兩個已經棄用、沒人同步的
  // repair_cost / detailing_cost 手動欄位——選哪台車、選哪個類別送出
  // 請款，這裡的數字就會自動跟著變，不用兩邊分別維護、也不會兜不起來。
  // 待審核中的金額另外顯示總和、不計入這兩個數字，跟
  // car-maintenance-tab.tsx／cars-kpi.tsx 的「已核准才算」邏輯一致。
  const approvedByCategory = (category: RepairItemCategory) =>
    repairItems
      .filter((r) => r.status === "approved" && r.category === category)
      .reduce((sum, r) => sum + Number(r.amount), 0);
  const approvedRepairCost = approvedByCategory("維修");
  const approvedDetailingCost = approvedByCategory("美容");
  const approvedOtherCost = approvedByCategory("其他");
  const pendingRepairCost = repairItems
    .filter((r) => r.status === "pending")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  // 車輛總成本：收購進價 + 過戶費/規費 + 稅金/發票稅金 + 已核准的整備
  // 維修/美容/其他開銷全部加起來——原本只有「維修請款與會計」分頁的
  // 財務損益卡（car-maintenance-tab.tsx 的 VehiclePnlCard）算過這個總數，
  // 「車輛資訊」分頁（也就是一打開車輛詳情頁預設看到的畫面）只列出各項
  // 分開的數字、沒有加總，要花多少錢一目瞭然還得切到另一個分頁才看得到
  // 總數。這裡直接在「成本結構」區塊最上面加一個總計，開起來就看得到，
  // 不用切分頁。
  // closed_commission_cost：這輛車結帳（售出）當下封存的業務抽成快照，
  // 只有已經售出的車輛才會有值，見 cars-actions.ts computeClosingFields()
  // 的說明。直接讀車輛本身的欄位，不需要另外把 deals 資料傳進這個
  // 元件——結完帳的數字本來就不會再變動，讀快照即可。
  //
  // 2026-08-30：安安反映業務抽成是薪資隱私，不希望其他員工從「車輛總
  // 成本」這個合計反推出來——所以這裡拆成 operatingSpent（收購進價＋
  // 過戶費/規費＋稅金＋已核准整備/美容/其他，不含抽成）跟 commissionCost
  // 兩塊，只有 canViewCommission 才把抽成併入顯示用的 totalSpent，否則
  // 合計就完全不含抽成，也不會另外顯示抽成那一行，避免看得到成本、但
  // 看不到全體薪資的人（例如預設的店長）能用「合計 − 已知項目」反推出
  // 抽成金額。
  const operatingSpent =
    Number(car.purchase_price) +
    Number(car.transfer_fee ?? 0) +
    Number(car.tax_amount ?? 0) +
    approvedRepairCost +
    approvedDetailingCost +
    approvedOtherCost;
  const commissionCost = Number(car.closed_commission_cost ?? 0);
  const showCommission = canViewCost && canViewCommission && car.closed_commission_cost != null;
  const totalSpent = operatingSpent + (showCommission ? commissionCost : 0);

  function handleQuickStatus(status: Car["status"]) {
    // 「設為已售出」原本只改狀態，完全不會問成交價，導致「定價」區塊的
    // 「最終成交價」永遠是空的——除非另外開「編輯車輛」手動填，或整個
    // 走「買賣合約與交易」建立合約走到交車。這裡順便問一次，一次到位。
    // 按「取消」或留空不阻擋狀態變更本身，維持原本快捷操作的行為，之後
    // 仍可以在「編輯車輛」裡補填，或事後回來走合約流程覆蓋。
    if (status === "sold") {
      const suggested = car.final_price ?? car.selling_price ?? null;
      const input = window.prompt(
        "請輸入這輛車的最終成交價（新台幣），填了會自動帶入「最終成交價」欄位，車行經營數據看板的已實現毛利也會用這個數字計算。\n\n不確定金額可以先留空或取消，之後再到「編輯車輛」補填。",
        suggested != null ? String(suggested) : ""
      );
      if (input === null) {
        startTransition(() => {
          updateCarStatus(car.id, status);
        });
        return;
      }
      const trimmed = input.trim();
      if (trimmed !== "") {
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) {
          window.alert("金額格式不正確，請輸入數字。");
          return;
        }
        startTransition(() => {
          updateCarStatus(car.id, status, parsed);
        });
        return;
      }
    }

    startTransition(() => {
      updateCarStatus(car.id, status);
    });
  }

  function handleDelete() {
    const name = [car.brand, car.model_name].filter(Boolean).join(" ");
    const confirmed = window.confirm(
      `確定要刪除「${name}」嗎？\n\n刪除後會從庫存列表隱藏，但資料不會馬上消失，之後可以到「已刪除」清單復原。`
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteCar(car.id);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    // 背景不綁 onClick：這個彈窗裡的「維修請款與會計」分頁可能有填到一半
    // 的內嵌表單，點外面不該直接關掉整個詳情頁。
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4 py-8 print:static print:bg-transparent print:p-0">
      {/* 列印用樣式：印表時只顯示 .car-spec-sheet，其餘畫面全部隱藏。 */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .car-spec-sheet, .car-spec-sheet * { visibility: visible; }
          .car-spec-sheet { position: fixed; inset: 0; }
        }
      `}</style>

      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-xl print:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 主圖 + 標題 */}
        <div className="relative aspect-[21/9] w-full overflow-hidden bg-neutral-100">
          {car.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={car.image_url}
              alt={car.model_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl text-neutral-300">
              🚗
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="absolute right-3 top-3 rounded-full bg-white/80 px-2.5 py-1 text-neutral-500 backdrop-blur hover:text-neutral-800"
          >
            ✕
          </button>
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-white/95 to-transparent p-4">
            <div>
              <p className="text-xs font-medium text-[#A6793D]">{car.brand ?? "未標示廠牌"}</p>
              <h2 className="text-xl font-semibold text-neutral-800">{car.model_name}</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <CarAgingBadge car={car} className="bg-white/90 backdrop-blur" />
              <CarStatusBadge status={car.status} />
            </div>
          </div>
        </div>

        {/* 分頁切換 */}
        <div className="flex gap-1 border-b border-neutral-200 px-5 pt-3">
          <TabButton active={tab === "info"} onClick={() => setTab("info")}>
            車輛資訊
          </TabButton>
          <TabButton active={tab === "maintenance"} onClick={() => setTab("maintenance")}>
            維修請款與會計
            {repairItems.some((r) => r.status === "pending") && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#B4813E]" />
            )}
          </TabButton>
        </div>

        {tab === "maintenance" ? (
          <div className="p-5">
            <CarMaintenanceTab
              car={car}
              repairItems={repairItems}
              canReview={canReview}
              canViewCost={canViewCost}
              canViewCommission={canViewCommission}
              receiptUrls={receiptUrls}
              staff={staff}
            />
          </div>
        ) : (
        <div className="space-y-6 p-5">
          {/* 快捷操作：一鍵切換車輛狀態 */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              快捷操作
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {STATUS_OPTIONS.filter((s) => s !== car.status).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={pending}
                  onClick={() => handleQuickStatus(s)}
                  className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-[#BFA074] hover:text-[#A6793D] disabled:opacity-50"
                >
                  {QUICK_ACTION_LABEL[s]}
                </button>
              ))}
            </div>
          </section>

          {/* 基本規格 */}
          <Section title="基本規格">
            <SpecGrid>
              <Spec label="廠牌" value={car.brand} />
              <Spec label="車型" value={car.model_name} />
              <Spec label="出廠年份" value={car.year ? `${car.year} 年` : null} />
              <Spec label="領牌年份" value={car.license_year ? `${car.license_year} 年` : null} />
              <Spec
                label="里程數"
                value={car.mileage != null ? `${formatNumber(car.mileage)} km` : null}
              />
              <Spec label="排氣量" value={car.engine_cc ? `${formatNumber(car.engine_cc)} cc` : null} />
              <Spec label="傳動/變速箱" value={car.transmission} />
              <Spec label="車身顏色" value={car.color} />
              <Spec label="車牌號碼" value={car.license_plate} />
              <Spec label="VIN 車身號碼" value={car.vin} />
              <Spec label="上架人" value={createdByName} />
              <Spec label="上架日期" value={formatDate(car.created_at)} />
              <Spec label="採購業務" value={purchasedByName} />
            </SpecGrid>
          </Section>

          {/* 車況與認證 */}
          <Section title="車況與認證">
            <SpecGrid>
              <Spec label="認證狀態" value={car.certification} />
            </SpecGrid>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {car.condition_notes && (
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
                {car.condition_notes}
              </p>
            )}
          </Section>

          {/* 定價：展示開價/預計底價/最終成交價都是「賣多少錢」的價格
              數字，統一放在同一區塊——展示開價每個人都要看得到（要跟
              客戶報價），預計底價/最終成交價是敏感財務資訊，沒有
              canViewCost 權限就遮罩，邏輯跟原本一樣，只是跟下面「成本」
              （花了多少錢）分開，不要混在同一個區塊裡。 */}
          <Section title="定價">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Money label="展示開價" value={car.selling_price} highlight />
              <Money label="預計底價" value={car.floor_price} mask={!canViewCost} />
              <Money label="最終成交價" value={car.final_price} mask={!canViewCost} highlight />
            </div>
          </Section>

          {/* 成本：純粹是「花了多少錢」的支出數字，敏感財務資訊，沒有
              canViewCost 權限就整格遮罩。整備維修成本／整理美容成本改讀
              請款紀錄依類別即時加總（見上面 approvedByCategory 的說明），
              不是手動填的數字。 */}
          <Section title="成本結構">
            {canViewCost ? (
              <div className="mb-3 rounded-xl bg-[#BFA074]/10 p-3">
                <p className="text-[11px] text-neutral-500">
                  {showCommission
                    ? "車輛總成本（收購進價 + 過戶費/規費 + 稅金 + 業務抽成 + 已核准整備維修/美容/其他）"
                    : "車輛總成本（收購進價 + 過戶費/規費 + 稅金 + 已核准整備維修/美容/其他，不含業務抽成）"}
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-[#A6793D]">
                  {formatCurrency(totalSpent)}
                </p>
              </div>
            ) : (
              <div className="mb-3 rounded-xl bg-[#F8F9FA] p-3 text-center text-sm text-neutral-400">
                🔒 車輛總成本屬於敏感財務資訊，沒有檢視權限
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Money label="收購進價" value={car.purchase_price} mask={!canViewCost} />
              <Money label="過戶費/規費" value={car.transfer_fee} mask={!canViewCost} />
              <Money label="稅金/發票稅金" value={car.tax_amount} mask={!canViewCost} />
              {showCommission && (
                <Money label="業務抽成（結帳封存）" value={car.closed_commission_cost} />
              )}
              <Money label="整備維修成本（已核准）" value={approvedRepairCost} mask={!canViewCost} />
              <Money label="整理美容成本（已核准）" value={approvedDetailingCost} mask={!canViewCost} />
              {approvedOtherCost > 0 && (
                <Money label="其他開銷（已核准）" value={approvedOtherCost} mask={!canViewCost} />
              )}
              {/* 2026-08-31 新增：真實最終成本，只有 canViewFinalCost（預設
                  會計/老闆）才會顯示這一行，即使看得到上面其他成本的店長/
                  員工也不會看到。刻意不併入上面的「車輛總成本」合計，跟
                  業務抽成一樣避免有人用「合計 － 已知項目」反推出這個
                  數字。 */}
              {canViewCost && canViewFinalCost && (
                <Money label="最終成本價格（僅會計/老闆可見）" value={car.final_cost_price} highlight />
              )}
            </div>
            {canViewCost && (
              <p className="mt-2 text-xs text-neutral-400">
                {pendingRepairCost > 0
                  ? `另有待審核的請款共 ${formatCurrency(pendingRepairCost)}（不分類別），核准後才會計入上面的數字。`
                  : "以上依類別的成本會依「維修請款與會計」分頁裡已核准撥款的紀錄自動加總。"}
                點上方「維修請款與會計」分頁可以看到每一筆項目明細。
              </p>
            )}
          </Section>

          {/* 操作列 */}
          <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-[#BFA074] hover:text-[#A6793D]"
            >
              🖨️ 列印展示卡
            </button>
            {canEditCars && (
              <button
                type="button"
                disabled={pending}
                onClick={handleDelete}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-500 transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                🗑 刪除車輛
              </button>
            )}
            {canEditCars && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066]"
              >
                編輯車輛
              </button>
            )}
          </div>
        </div>
        )}
      </div>

      {/* 印表專用展示卡：畫面上永遠隱藏，只有觸發列印時才顯示（見上面的 @media print）。 */}
      <div className="car-spec-sheet hidden bg-white p-10 text-neutral-800 print:block">
        <div className="flex items-center justify-between border-b-2 border-neutral-800 pb-4">
          <div>
            <p className="text-sm text-neutral-500">{tenantName ?? "中古車行"}</p>
            <h1 className="text-3xl font-bold">
              {car.brand} {car.model_name}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-sm text-neutral-500">開價</p>
            <p className="text-4xl font-bold">
              {car.selling_price != null ? formatCurrency(car.selling_price) : "洽詢"}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 text-lg">
          <PrintSpec label="年式" value={car.year ? `${car.year} 年` : "—"} />
          <PrintSpec
            label="里程"
            value={car.mileage != null ? `${formatNumber(car.mileage)} km` : "—"}
          />
          <PrintSpec label="排氣量" value={car.engine_cc ? `${formatNumber(car.engine_cc)} cc` : "—"} />
          <PrintSpec label="變速箱" value={car.transmission ?? "—"} />
          <PrintSpec label="顏色" value={car.color ?? "—"} />
          <PrintSpec label="車牌" value={car.license_plate ?? "—"} />
        </div>

        {tags.length > 0 && (
          <div className="mt-6">
            <p className="text-sm text-neutral-500">配備</p>
            <p className="mt-1 text-base">{tags.join("・")}</p>
          </div>
        )}

        {car.certification && (
          <p className="mt-4 inline-block rounded border border-neutral-800 px-3 py-1 text-sm font-medium">
            ✓ {car.certification}
          </p>
        )}

        <p className="mt-10 text-xs text-neutral-400">
          本展示卡資訊僅供參考，實際車況與價格請以現場為準。
        </p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "-mb-px flex items-center border-b-2 px-3 py-2 text-sm font-medium transition " +
        (active
          ? "border-[#BFA074] text-[#A6793D]"
          : "border-transparent text-neutral-400 hover:text-neutral-600")
      }
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function SpecGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">{children}</div>;
}

function Spec({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p className="text-sm text-neutral-700">{value ?? "—"}</p>
    </div>
  );
}

function Money({
  label,
  value,
  mask = false,
  highlight = false,
}: {
  label: string;
  value: number | null | undefined;
  mask?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p
        className={
          "text-sm font-medium tabular-nums " + (highlight ? "text-[#A6793D]" : "text-neutral-700")
        }
      >
        {mask ? "🔒 權限不足" : value != null ? formatCurrency(value) : "—"}
      </p>
    </div>
  );
}

function PrintSpec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
