"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createDeal, updateDeal, type DealFormState } from "../deals-actions";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";
import { CASH_POOL_METHOD_OPTIONS } from "@/lib/cash-pool";
import { formatCurrency } from "@/lib/format";
import type { Car, Customer, Deal, DealStatus, RepairItem } from "@/lib/supabase/types";

const STATUS_OPTIONS: { value: DealStatus; label: string }[] = [
  { value: "draft", label: "草約" },
  { value: "signed", label: "已簽約" },
  { value: "delivered", label: "已交車" },
];

const initialState: DealFormState = {};
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

export function DealFormModal({
  mode,
  deal,
  cars,
  customers,
  staff,
  repairItems,
  canManageFinance,
  onClose,
}: {
  mode: "create" | "edit";
  deal?: Deal;
  cars: Car[];
  customers: Customer[];
  staff: { id: string; name: string | null }[];
  /** 「業務薪水試算小工具」算車輛已核准的維修整備費要用——只有
   * canManageFinance 的人看得到這個試算工具，業務就算拿到這個 prop 也
   * 看不到用不到，見下面的說明。 */
  repairItems: RepairItem[];
  /** 2026-08-30：合約流程是業務填寫送出（草約/已簽約），交給會計審核填
   * 稅金/業務抽成、確認無誤後才把合約標記為「已交車」結案——不是老闆
   * 自己一個個填，也不是業務自己填自己的抽成。所以這裡改用
   * canManageFinance（老闆恆為 true，會計預設也是 true，店長/員工預設
   * false）而不是原本的 canManageStaff，見 dashboard-shell.tsx 的說明。
   * 這個權限同時控制：(1) 預估抽成欄位＋業務薪水試算小工具看不看得到、
   * 填不填得了；(2) 下面「合約狀態」下拉選單裡看不看得到「已交車」這個
   * 選項——沒有這個權限的人，合約狀態最多只能填到「已簽約」，「已交車」
   * 要交給會計/老闆來標記，見下面 availableStatusOptions 的說明。 */
  canManageFinance: boolean;
  onClose: () => void;
}) {
  const action = mode === "create" ? createDeal : updateDeal;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [customerId, setCustomerId] = useState(deal?.customer_id ?? "");
  const [customerName, setCustomerName] = useState(deal?.customer_name ?? "");
  const [customerPhone, setCustomerPhone] = useState(deal?.customer_phone ?? "");
  // 「選定車輛」「成交價」原本是 uncontrolled（defaultValue）——「業務薪水
  // 試算小工具」需要即時知道使用者選了哪台車、打了多少成交價才能即時算，
  // 改成 controlled，行為不變（一樣把值透過同名 name 帶進 FormData）。
  const [carId, setCarId] = useState(deal?.car_id ?? "");
  const [finalPrice, setFinalPrice] = useState(deal?.final_price != null ? String(deal.final_price) : "");
  const { markDirty, requestClose } = useUnsavedChangesGuard(onClose);

  useEffect(() => {
    if (state?.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleSelectCustomer(id: string) {
    setCustomerId(id);
    const found = customers.find((c) => c.id === id);
    if (found) {
      setCustomerName(found.name);
      setCustomerPhone(found.phone ?? "");
    }
  }

  // ---------------------------------------------------------------------
  // 「業務薪水試算小工具」——2026-08-30 新增。安安反映庫存管理那邊「總
  // 成本」的正確算法應該是「收購價＋維修整備費＋規費＋稅金」，再用「成交
  // 價－總成本」才是這台車真正的淨利；她想用這個淨利，再扣掉「我們平常
  // 的稅金」（她自己填，可以填百分比、也可以直接填固定金額），算出稅後
  // 淨利，接著用同一套「百分比／固定金額」兩種填法，決定業務這筆的薪水／
  // 抽成建議金額。算出來的建議金額只是「帶入」到下面本來就有的「預估
  // 抽成」欄位，不會自動覆蓋、也不會單獨存進資料庫——deals 表只認「預估
  // 抽成」那個數字，試算過程的稅金/抽成比例只是幫忙算這個數字用的計算機，
  // 不影響既有的資料結構跟其他地方的邏輯。canManageFinance 之外的人本來
  // 就看不到這整個區塊。
  //
  // 2026-08-30 第二次確認：(1) 只要選好車、填了成交價，這個試算區塊
  // 要自動跳出來，不用再手動點開／收起，見下面 JSX 直接用
  // `!selectedCar || revenue == null` 判斷要不要顯示內容，拿掉了原本的
  // showCalculator 開關；(2) 合約狀態要從草約/已簽約改成「已交車」的那
  // 一刻，稅金／業務抽成至少都要填過一次（可以直接填 0，不強制要有實際
  // 金額，只是不能整個空著），否則擋住不讓存檔——見下面 handleSubmit()。
  // 已經是「已交車」的舊合約，之後編輯其他欄位重新存檔不會被回頭要求
  // 補填，只在「這次才要把狀態改成已交車」的那個瞬間才檢查，避免舊資料
  // 被卡住存不了檔。
  //
  // 2026-08-30 第三次確認：安安反映合約是業務填寫送出、由「會計」審核
  // 填稅金/抽成後才結案，不是老闆自己填、也不是業務自己填自己的抽成。
  // 原本這整個區塊（含「合約狀態」能不能選「已交車」）都是綁
  // canManageStaff（只有老闆）——現在改綁 canManageFinance（老闆恆為
  // true，會計預設也是 true），業務（沒有這個權限）打開合約表單完全看
  // 不到預估抽成／試算小工具，「合約狀態」下拉選單也只會看到「草約」
  // 「已簽約」，選不到「已交車」——把合約填好、狀態改成「已簽約」就是
  // 業務這端能做到的最後一步，要交給會計打開同一張合約、填好稅金/抽成
  // 之後才能把狀態改成「已交車」結案。伺服器端（deals-actions.ts）也有
  // 對應的權限檢查，不是只有前端擋。
  const [validationError, setValidationError] = useState<string | null>(null);
  const previousStatus = deal?.status ?? null;
  const [taxMode, setTaxMode] = useState<"percent" | "amount">("amount");
  const [taxPercent, setTaxPercent] = useState("");
  const [taxFixed, setTaxFixed] = useState("");
  const [commissionMode, setCommissionMode] = useState<"percent" | "amount">("percent");
  const [commissionPercent, setCommissionPercent] = useState("");
  const [commissionFixed, setCommissionFixed] = useState("");
  const commissionInputRef = useRef<HTMLInputElement>(null);

  const selectedCar = useMemo(() => cars.find((c) => c.id === carId) ?? null, [cars, carId]);

  // 「已交車」只有 canManageFinance（老闆/會計）能選——業務打開這個下拉
  // 選單只會看到「草約」「已簽約」，沒辦法自己把合約標記成已交車結案。
  // 例外：如果這張合約本來就已經是「已交車」（例如會計標記完之後，業務
  // 之後又被找回來改客戶電話之類的小地方），保留這個選項讓 <select> 的
  // value 對得上目前的狀態，不會因為選項消失而看起來像資料跑掉，但業務
  // 依然無法把其他狀態「改成」已交車（下面 handleSubmit 對應的伺服器端
  // 也有檢查，不是只擋前端）。
  const availableStatusOptions = useMemo(
    () => STATUS_OPTIONS.filter((opt) => opt.value !== "delivered" || canManageFinance || deal?.status === "delivered"),
    [canManageFinance, deal?.status]
  );

  // 車輛總成本＝收購價＋已核准維修整備費＋規費＋稅金，跟 cars-kpi.tsx／
  // car-maintenance-tab.tsx／analytics-module.tsx 是同一套公式，這裡不
  // 應該、也不會再各算各的一套。已結帳（closed_at 有值，理論上不太會
  // 發生在「還沒交車」的合約選的車上）就直接用封存快照，避免顯示跟真正
  // 入帳的數字對不起來。
  const vehicleTotalCost = useMemo(() => {
    if (!selectedCar) return null;
    if (selectedCar.closed_at != null) return Number(selectedCar.closed_total_cost ?? 0);
    const approvedPrepCost = repairItems
      .filter((r) => r.car_id === selectedCar.id && r.status === "approved")
      .reduce((sum, r) => sum + Number(r.amount), 0);
    return (
      Number(selectedCar.purchase_price) +
      approvedPrepCost +
      Number(selectedCar.transfer_fee ?? 0) +
      Number(selectedCar.tax_amount ?? 0)
    );
  }, [selectedCar, repairItems]);

  const revenue = finalPrice.trim() === "" ? null : Number(finalPrice);
  const preTaxProfit =
    vehicleTotalCost != null && revenue != null && Number.isFinite(revenue) ? revenue - vehicleTotalCost : null;

  const taxDeduction =
    preTaxProfit == null
      ? null
      : taxMode === "percent"
        ? taxPercent.trim() === ""
          ? null
          : (preTaxProfit * Number(taxPercent)) / 100
        : taxFixed.trim() === ""
          ? 0
          : Number(taxFixed);

  const afterTaxProfit = preTaxProfit == null || taxDeduction == null ? null : preTaxProfit - taxDeduction;

  const suggestedCommission =
    afterTaxProfit == null
      ? null
      : commissionMode === "percent"
        ? commissionPercent.trim() === ""
          ? null
          : (afterTaxProfit * Number(commissionPercent)) / 100
        : commissionFixed.trim() === ""
          ? null
          : Number(commissionFixed);

  function applySuggestedCommission() {
    if (suggestedCommission == null || !commissionInputRef.current) return;
    commissionInputRef.current.value = String(Math.round(suggestedCommission));
  }

  // 送出表單前的檢查：只有「這次才要把合約狀態改成已交車」（草約/已簽約
  // → 已交車，或新增合約直接選已交車）才需要檢查；已經是已交車的舊合約
  // 重新存檔（例如只是訂正客戶電話）不受影響。用 FormData 直接讀當下
  // <select name="status"> 的值，不用把它額外改成 controlled。
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    setValidationError(null);
    if (!canManageFinance) return;

    const formData = new FormData(e.currentTarget);
    const nextStatus = String(formData.get("status") ?? "draft");
    if (nextStatus !== "delivered" || previousStatus === "delivered") return;

    // 2026-08-30 修正：這裡原本檢查的是試算小工具的暫存欄位
    // （taxPercent/taxFixed/commissionPercent/commissionFixed），但這幾個
    // input 完全沒有 name 屬性，不會進 FormData、也不是真正存進資料庫的
    // 欄位——使用者只要在試算工具隨便打個數字、卻忘記按「帶入上方抽成
    // 欄位」，這裡的檢查就會誤判成「已經填過」而放行，結果實際存檔的
    // 「預估抽成」（commission_amount，真正會被結帳快照跟業務薪資模組
    // 讀取的欄位）反而是空的。改成直接檢查 FormData 裡 commission_amount
    // 這個真正會送出的欄位有沒有值，才能保證「已交車」的合約一定有抽成
    // 數字可用；稅金因為只是試算小工具的輔助計算，deals 資料表本身沒有
    // 對應欄位可以存，維持原本用暫存欄位判斷「至少填過一次」即可。
    const taxFilled = taxMode === "percent" ? taxPercent.trim() !== "" : taxFixed.trim() !== "";
    const commissionAmountRaw = formData.get("commission_amount");
    const commissionFilled = commissionAmountRaw != null && String(commissionAmountRaw).trim() !== "";

    if (!taxFilled || !commissionFilled) {
      e.preventDefault();
      setValidationError(
        "合約狀態要改成「已交車」之前，請先在下面「🧮 業務薪水試算」填好「我們平常的稅金」，並確認上面「預估抽成」欄位已經有數字（沒有的話可以填 0，或按「帶入上方抽成欄位」直接帶入試算結果）。"
      );
    }
  }

  return (
    // 背景不綁 onClick，避免點外面誤觸清掉表單。
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4 py-8">
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-800">
            {mode === "create" ? "新增合約" : "編輯合約"}
          </h3>
          <button type="button" onClick={requestClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>

        <form action={formAction} onChange={markDirty} onSubmit={handleSubmit} className="mt-4 space-y-4">
          {mode === "edit" && deal && <input type="hidden" name="id" value={deal.id} />}
          <input type="hidden" name="customer_id" value={customerId} />

          <div>
            <label className="block text-sm font-medium text-neutral-700">選定車輛</label>
            {mode === "create" ? (
              <select
                name="car_id"
                value={carId}
                onChange={(e) => setCarId(e.target.value)}
                required
                className={INPUT_CLASS}
              >
                <option value="" disabled>
                  請選擇車輛
                </option>
                {cars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.brand ? `${c.brand} ` : ""}
                    {c.model_name}
                    {c.license_plate ? `（${c.license_plate}）` : ""}
                  </option>
                ))}
              </select>
            ) : (
              // 2026-08-30：合約建立之後，車輛不可再被改成別台——這裡改成
              // 唯讀顯示＋隱藏欄位固定送出原本的 car_id，不給互動式下拉選單，
              // 前端這層是防呆；真正擋住惡意繞過前端直接改 car_id 的防線在
              // deals-actions.ts 的 updateDeal()（伺服器端強制比對舊值）。
              <>
                <input type="hidden" name="car_id" value={carId} />
                <div className={INPUT_CLASS + " cursor-not-allowed bg-neutral-100 text-neutral-500"}>
                  {selectedCar
                    ? `${selectedCar.brand ? `${selectedCar.brand} ` : ""}${selectedCar.model_name}${
                        selectedCar.license_plate ? `（${selectedCar.license_plate}）` : ""
                      }`
                    : "—"}
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  合約建立後車輛不可更改，如果簽錯車輛請聯繫車行管理員另外處理。
                </p>
              </>
            )}
          </div>

          {/* 2026-08-31：安安反映一般業務/店長建立合約時，不該開放手動
              打一個新客戶姓名就結案——那樣客戶的聯絡方式跟後續需求就
              不會留在「客戶管理」（CRM）裡。canManageFinance（會計/老闆）
              維持原本可以不指定/手動輸入的彈性；其餘角色一律要從既有
              客戶選，姓名/電話改唯讀自動帶入，伺服器端 deals-actions.ts
              的 resolveCustomerFields() 也會擋掉任何繞過前端的嘗試。 */}
          {canManageFinance ? (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-700">選定客戶（可選）</label>
                <select
                  value={customerId}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">不指定 CRM 客戶，直接手動輸入</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? `（${c.phone}）` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700">客戶姓名</label>
                  <input
                    name="customer_name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">客戶電話</label>
                  <input
                    name="customer_phone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-700">選定客戶</label>
                <select
                  value={customerId}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  required
                  className={INPUT_CLASS}
                >
                  <option value="" disabled>
                    {customers.length === 0 ? "尚未有客戶資料" : "請選擇客戶"}
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? `（${c.phone}）` : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-neutral-400">
                  {customers.length === 0
                    ? "目前「客戶管理」裡還沒有資料，請先到那邊新增這位客戶，再回來建立合約。"
                    : "一律要從既有客戶裡選擇，不開放手動輸入新客戶資料——這樣客戶的聯絡方式跟未來需求才會留在「客戶管理」裡，不會因為合約結案就找不到人。"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700">客戶姓名</label>
                  <div className={INPUT_CLASS + " cursor-not-allowed bg-neutral-100 text-neutral-500"}>
                    {customerName || "—"}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">客戶電話</label>
                  <div className={INPUT_CLASS + " cursor-not-allowed bg-neutral-100 text-neutral-500"}>
                    {customerPhone || "—"}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="final_price" className="block text-sm font-medium text-neutral-700">
                成交價
              </label>
              <input
                id="final_price"
                name="final_price"
                type="number"
                min={0}
                step="any"
                value={finalPrice}
                onChange={(e) => setFinalPrice(e.target.value)}
                required
                className={INPUT_CLASS}
              />
            </div>
            <Field
              label="訂金"
              name="deposit_amount"
              type="number"
              defaultValue={deal?.deposit_amount != null ? String(deal.deposit_amount) : ""}
            />
            <Field
              label="尾款"
              name="balance_amount"
              type="number"
              defaultValue={deal?.balance_amount != null ? String(deal.balance_amount) : ""}
            />
          </div>

          {/* 2026-08-31：訂金／尾款分開記錄收款方式——安安反映實務上訂金
              常常是現金、尾款才走匯款（或反過來），舊版單一「收款方式
              （訂金＋尾款）」欄位沒辦法反映，導致「資金總覽」水池對不
              起來。改成兩個獨立下拉選單，各自對應各自的金額。 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700">訂金收款方式</label>
              <select
                name="deposit_payment_method"
                defaultValue={deal?.deposit_payment_method ?? ""}
                className={INPUT_CLASS}
              >
                <option value="">尚未收款／不指定</option>
                {CASH_POOL_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">尾款收款方式</label>
              <select
                name="balance_payment_method"
                defaultValue={deal?.balance_payment_method ?? ""}
                className={INPUT_CLASS}
              >
                <option value="">尚未收款／不指定</option>
                {CASH_POOL_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="-mt-2 text-xs text-neutral-400">
            給後台「資金總覽」水池分類用——訂金、尾款各自是付現金還是匯款進來，交車前才收到的尾款可以先留空，等實際收款後再回來補選。
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="貸款進度"
              name="loan_status"
              defaultValue={deal?.loan_status ?? ""}
              placeholder="無貸款／審核中／已核貸"
            />
            <div>
              <label className="block text-sm font-medium text-neutral-700">承辦業務</label>
              <select
                name="salesperson_id"
                defaultValue={deal?.salesperson_id ?? ""}
                className={INPUT_CLASS}
              >
                <option value="">未指定</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ?? "未命名"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 業務抽成只有老闆/會計（canManageFinance）能填——業務不開放
              自己填自己的抽成金額。非管理員送出表單時這個欄位完全不會
              出現在 FormData 裡，deals-actions.ts 那邊也會忽略任何非
              管理員帶上來的值，雙重防呆。 */}
          {canManageFinance && (
            <div>
              <div>
                <label htmlFor="commission_amount" className="block text-sm font-medium text-neutral-700">
                  預估抽成（撥給承辦業務）
                </label>
                <input
                  id="commission_amount"
                  name="commission_amount"
                  type="number"
                  min={0}
                  step="any"
                  ref={commissionInputRef}
                  defaultValue={deal?.commission_amount != null ? String(deal.commission_amount) : ""}
                  placeholder="選填，例如 8000"
                  className={INPUT_CLASS}
                />
              </div>

              {/* 2026-08-30：試算小工具原本預設收起來、要手動點開——安安
                  希望只要選好車、填了成交價就自動跳出來，不用再多點一次，
                  這裡拿掉了原本的 showCalculator 開關，直接依有沒有選好
                  車／填好成交價決定顯示內容。 */}
              <div className="mt-2 space-y-3 rounded-xl border border-neutral-200 bg-[#F8F9FA] p-3.5 text-sm">
                <h4 className="text-xs font-semibold text-neutral-600">🧮 業務薪水試算</h4>
                {!selectedCar || revenue == null ? (
                  <p className="text-xs text-neutral-400">請先選好車輛、填好成交價，這裡會自動跳出試算。</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500">
                        稅前淨利（成交價 − 收購價/整備費/規費/稅金的總成本）
                      </span>
                      <span
                        className={
                          "font-semibold tabular-nums " +
                          (preTaxProfit != null && preTaxProfit < 0 ? "text-[#B75454]" : "text-neutral-800")
                        }
                      >
                        {preTaxProfit != null ? formatCurrency(preTaxProfit) : "—"}
                      </span>
                    </div>

                    <RateOrAmountRow
                      label="我們平常的稅金"
                      mode={taxMode}
                      onModeChange={setTaxMode}
                      percentValue={taxPercent}
                      onPercentChange={setTaxPercent}
                      amountValue={taxFixed}
                      onAmountChange={setTaxFixed}
                      percentPlaceholder="例如 5（＝稅前淨利的 5%）"
                      amountPlaceholder="沒有稅金可以填 0"
                    />

                    <div className="flex items-center justify-between border-t border-neutral-200 pt-2.5">
                      <span className="text-xs text-neutral-500">稅後淨利</span>
                      <span className="font-semibold tabular-nums text-neutral-800">
                        {afterTaxProfit != null ? formatCurrency(afterTaxProfit) : "—"}
                      </span>
                    </div>

                    <RateOrAmountRow
                      label="業務抽成"
                      mode={commissionMode}
                      onModeChange={setCommissionMode}
                      percentValue={commissionPercent}
                      onPercentChange={setCommissionPercent}
                      amountValue={commissionFixed}
                      onAmountChange={setCommissionFixed}
                      percentPlaceholder="例如 30（＝稅後淨利的 30%）"
                      amountPlaceholder="沒有抽成可以填 0"
                    />

                    <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-2.5">
                      <div>
                        <p className="text-xs text-neutral-500">建議薪水金額</p>
                        <p className="text-lg font-semibold tabular-nums text-[#A6793D]">
                          {suggestedCommission != null ? formatCurrency(suggestedCommission) : "—"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={applySuggestedCommission}
                        disabled={suggestedCommission == null}
                        className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        帶入上方抽成欄位
                      </button>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      這裡只是幫忙算數字，帶入之後上方欄位仍然可以手動調整，實際存檔以「預估抽成」欄位的數字為準。合約狀態要改成「已交車」之前，稅金與業務抽成至少都要填過一次（可以填 0）。
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700">合約狀態</label>
            <select name="status" defaultValue={deal?.status ?? "draft"} className={INPUT_CLASS}>
              {availableStatusOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {!canManageFinance && (
              <p className="mt-1 text-xs text-neutral-400">
                「已交車」要交給會計/老闆確認稅金與業務抽成後才能標記，這裡最多只能填到「已簽約」。
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">備註</label>
            <textarea name="note" defaultValue={deal?.note ?? ""} rows={2} className={INPUT_CLASS + " resize-y"} />
          </div>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
              {state.error}
            </p>
          )}

          {validationError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
              {validationError}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:opacity-60"
            >
              {pending ? "儲存中…" : "儲存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-neutral-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        className={INPUT_CLASS}
      />
    </div>
  );
}

/**
 * 「業務薪水試算小工具」共用的一列——「稅金」跟「業務抽成」都要支援
 * 同一套「填百分比／填固定金額」二選一介面，不要各寫一份，兩邊的算法/
 * 外觀才會真的一致（見 DealFormModal 開頭的說明）。
 */
function RateOrAmountRow({
  label,
  mode,
  onModeChange,
  percentValue,
  onPercentChange,
  amountValue,
  onAmountChange,
  percentPlaceholder,
  amountPlaceholder,
}: {
  label: string;
  mode: "percent" | "amount";
  onModeChange: (mode: "percent" | "amount") => void;
  percentValue: string;
  onPercentChange: (value: string) => void;
  amountValue: string;
  onAmountChange: (value: string) => void;
  percentPlaceholder: string;
  amountPlaceholder: string;
}) {
  const calcInputClass =
    "w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074]";

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-600">{label}</span>
        <div className="flex overflow-hidden rounded-md border border-neutral-200 text-[11px]">
          <button
            type="button"
            onClick={() => onModeChange("percent")}
            className={"px-2 py-1 font-medium transition " + (mode === "percent" ? "bg-[#BFA074] text-white" : "bg-white text-neutral-500")}
          >
            填 %
          </button>
          <button
            type="button"
            onClick={() => onModeChange("amount")}
            className={"px-2 py-1 font-medium transition " + (mode === "amount" ? "bg-[#BFA074] text-white" : "bg-white text-neutral-500")}
          >
            填金額
          </button>
        </div>
      </div>
      <div className="mt-1.5">
        {mode === "percent" ? (
          <input
            type="number"
            min={0}
            step="any"
            value={percentValue}
            onChange={(e) => onPercentChange(e.target.value)}
            placeholder={percentPlaceholder}
            className={calcInputClass}
          />
        ) : (
          <input
            type="number"
            min={0}
            step="any"
            value={amountValue}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder={amountPlaceholder}
            className={calcInputClass}
          />
        )}
      </div>
    </div>
  );
}
