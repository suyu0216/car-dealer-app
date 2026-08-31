// 「資金總覽」現金流水池的共用邏輯：把分散在 deals（成交收款）／cars
// （進貨付款）／repair_items（維修/整備請款撥款）／company_expenses
// （公司開銷）／transactions（手動記帳）五個地方的金流，換算成「現金
// 水池」跟「銀行水池」兩個數字。純函式、不碰資料庫，Client Component
// （畫面）跟未來如果要在 Server Component 算一次都能重複使用，也方便
// 之後補測試。
//
// 2026-08-31：安安反映「所有的帳目都要跟水池對上」，深度檢查後補上原本
// 完全沒被算進來的 repair_items（維修/整備請款核准撥款——這張表原本
// 根本沒有付款方式欄位，不是漏寫程式，見下面第 5 點），並修正了兩個
// 讓水池對不起來的落差：(1) 進貨付款金額原本讀容易被忘記填的
// car.paid_amount，改讀真正認列成本、必填的 car.purchase_price；
// (2) 合約尾款事件原本用合約建立日判斷起算點，改用真正交車日
// （delivered_at），避免起算點前建立、起算點後才交車收尾款的合約，
// 尾款收款被誤判成「起算點之前」而漏算。
//
// 核心概念：水池不是从系统一开始就有的、完整的歷史流水帳——車行過去的
// 現金/銀行餘額系統並不知道，所以需要車行管理員先手動設定一個「起算點」
// （見 cash_pool_started_at），從那天（含）開始，之後每一筆新發生的成交
// 收款／開銷／進貨付款／手動紀錄才會被算進水池增減；起算日之前的舊資料
// 完全不看，因為那些已經反映在管理員自己輸入的「期初餘額」裡了。
import type { Car, CashPoolMethod, CompanyExpense, Deal, RepairItem, Transaction } from "./supabase/types";

export const CASH_POOL_METHOD_OPTIONS: { value: CashPoolMethod; label: string }[] = [
  { value: "cash", label: "💵 現金" },
  { value: "bank", label: "🏦 銀行／匯款" },
];

/** 手動記一筆（不屬於成交收款／公司開銷／進貨付款的其他現金異動）常見
 * 類別，純粹給下拉選單方便挑選，資料庫欄位本身是自由文字，不是強制清單。 */
export const MANUAL_TRANSACTION_CATEGORIES = [
  "老闆存入",
  "老闆提領",
  "銀行利息",
  "轉帳/提款手續費",
  "零用金整理",
  "其他",
] as const;

/** 把 cars.payment_method（bank_transfer / debt_settlement / cash）換算成
 * 水池的兩池之一。debt_settlement（客戶代結清）：車行是把錢直接匯給貸款
 * 銀行結清前手的車貸，實務上幾乎都是匯款，歸類進銀行池。 */
function carPaymentToPoolMethod(method: Car["payment_method"]): CashPoolMethod | null {
  if (method === "cash") return "cash";
  if (method === "bank_transfer" || method === "debt_settlement") return "bank";
  return null;
}

/** 把 company_expenses.payment_method（匯款/現金/信用卡）換算成水池的
 * 兩池之一。信用卡：帳單最終還是從銀行帳戶扣款，歸類進銀行池。 */
function expensePaymentToPoolMethod(method: CompanyExpense["payment_method"]): CashPoolMethod | null {
  if (method === "現金") return "cash";
  if (method === "匯款" || method === "信用卡") return "bank";
  return null;
}

export type CashPoolEventKind = "deal_income" | "car_expense" | "repair_expense" | "company_expense" | "manual";

export interface CashPoolEvent {
  id: string;
  kind: CashPoolEventKind;
  /** 正數＝流入水池，負數＝流出水池。 */
  amount: number;
  method: CashPoolMethod;
  date: string;
  title: string;
  detail?: string;
  /** 給時間軸點擊「查看原始紀錄」用（例如車輛/合約 id），目前只有內部
   * 資料用途，畫面上還沒做跳轉連結。 */
  sourceId: string;
}

export interface CashPoolTotals {
  opening: number;
  inflow: number;
  outflow: number;
  balance: number;
}

export interface CashPoolSummary {
  /** 尚未設定起算點（cash_pool_started_at 是 null）——這種狀態下不計算
   * 任何金額，畫面只顯示「請先設定起算點」的引導。 */
  configured: boolean;
  startedAt: string | null;
  cash: CashPoolTotals;
  bank: CashPoolTotals;
  /** 由新到舊排序，合併五個來源的完整流水。 */
  timeline: CashPoolEvent[];
}

const EMPTY_TOTALS: CashPoolTotals = { opening: 0, inflow: 0, outflow: 0, balance: 0 };

export function computeCashPoolSummary(params: {
  cashOpening: number | null;
  bankOpening: number | null;
  startedAt: string | null;
  deals: Pick<
    Deal,
    | "id"
    | "final_price"
    | "deposit_amount"
    | "balance_amount"
    | "deposit_payment_method"
    | "balance_payment_method"
    | "status"
    | "created_at"
    | "delivered_at"
    | "customer_name"
  >[];
  cars: Pick<Car, "id" | "purchase_price" | "payment_method" | "created_at" | "brand" | "model_name">[];
  expenses: Pick<CompanyExpense, "id" | "amount" | "payment_method" | "expense_date" | "title">[];
  manual: Pick<Transaction, "id" | "type" | "amount" | "payment_method" | "date" | "category" | "note">[];
  repairItems: Pick<
    RepairItem,
    "id" | "car_id" | "item_name" | "category" | "amount" | "status" | "payment_method" | "reviewed_at" | "created_at"
  >[];
}): CashPoolSummary {
  const { cashOpening, bankOpening, startedAt, deals, cars, expenses, manual, repairItems } = params;

  if (!startedAt) {
    return { configured: false, startedAt: null, cash: EMPTY_TOTALS, bank: EMPTY_TOTALS, timeline: [] };
  }

  const events: CashPoolEvent[] = [];
  const isOnOrAfterStart = (iso: string) => iso.slice(0, 10) >= startedAt;

  // 1. 成交收款：草約還沒收訂金不算；已簽約算訂金；已交車視為訂金＋尾款
  //    都已收齊（車都交出去了，實務上錢一定收完了）。
  //
  // 2026-08-31：訂金／尾款分開記錄各自的收款方式（deposit_payment_method／
  // balance_payment_method）——實務上訂金常常是現金、尾款才走匯款（或
  // 反過來），舊版把整筆合起來當一種方式算，會導致現金／銀行水池對不
  // 起來。這裡拆成最多兩筆獨立事件：訂金一筆（已簽約/已交車都算）、
  // 尾款一筆（只有已交車才算，因為尾款要車真的交出去才會收齊），各自
  // 用各自的收款方式歸類進對應的池子，兩者可以是不同的池。
  for (const deal of deals) {
    if (!isOnOrAfterStart(deal.created_at)) continue;

    const depositReceived = deal.status === "signed" || deal.status === "delivered";
    const depositAmount = Number(deal.deposit_amount ?? 0);
    if (depositReceived && depositAmount > 0 && deal.deposit_payment_method) {
      events.push({
        id: `deal:${deal.id}:deposit`,
        kind: "deal_income",
        amount: depositAmount,
        method: deal.deposit_payment_method,
        date: deal.created_at,
        title: `成交收款・${deal.customer_name}`,
        detail: "訂金",
        sourceId: deal.id,
      });
    }

    // 2026-08-31 修正：尾款的實際收款日應該是「真正交車」那天，不是
    // 合約建立日（deal.created_at）——舊版兩筆事件都共用 created_at，
    // 如果合約是水池起算點之前建立、卻是起算點之後才交車收尾款，會被
    // isOnOrAfterStart(deal.created_at) 誤判成「起算點之前」整筆算不到，
    // 尾款收款這筆真實金流就這樣從水池裡憑空消失。改用 delivered_at
    // （沒有值的舊資料才退回 created_at，理論上遷移時已經一次性回填過，
    // 只有極早期資料才可能是 null）判斷跟顯示日期，訂金維持用
    // created_at（訂金通常簽約當下就收，跟合約建立日一致）。
    const balanceDate = deal.delivered_at ?? deal.created_at;
    const balanceAmount = Number(deal.balance_amount ?? 0);
    if (
      deal.status === "delivered" &&
      balanceAmount > 0 &&
      deal.balance_payment_method &&
      isOnOrAfterStart(balanceDate)
    ) {
      events.push({
        id: `deal:${deal.id}:balance`,
        kind: "deal_income",
        amount: balanceAmount,
        method: deal.balance_payment_method,
        date: balanceDate,
        title: `成交收款・${deal.customer_name}`,
        detail: "尾款",
        sourceId: deal.id,
      });
    }
  }

  // 2. 進貨付款：買車付給前車主／代結清貸款銀行的錢，是水池的流出。
  //
  // 2026-08-31 修正：金額原本讀 car.paid_amount（「進貨付款追蹤」折疊
  // 區塊裡一個獨立、預設收起來、很容易忘記填的欄位），跟真正拿去算
  // 成本／月毛利的 car.purchase_price（「收購進價」，必填）是兩個分開
  // 的欄位——安安反映「進貨的錢沒有真的從水池扣掉」，查下來就是這個
  // 落差：收購進價正確算進了成本，但沒人記得另外去填一次「已付金額」，
  // 水池自然看不到這筆流出。改成直接用 purchase_price（這台車真正認列
  // 的收購成本）當水池流出金額，只要有選付款方式就會算，不用再靠使用者
  // 記得另外填一次金額；car-form-modal.tsx 也把「付款方式」從折疊區塊
  // 移到跟收購進價同一區塊、變成必填，兩者綁在一起不會再各填各的。
  for (const car of cars) {
    if (!isOnOrAfterStart(car.created_at)) continue;
    const method = carPaymentToPoolMethod(car.payment_method);
    const amount = Number(car.purchase_price ?? 0);
    if (!method || amount <= 0) continue;
    events.push({
      id: `car:${car.id}`,
      kind: "car_expense",
      amount: -amount,
      method,
      date: car.created_at,
      title: `進貨付款・${car.brand ? `${car.brand} ` : ""}${car.model_name}`,
      sourceId: car.id,
    });
  }

  // 3. 維修/整備請款撥款：會計核准撥款當下才是真正的現金流出，用
  //    reviewed_at（核准時間）判斷日期跟起算點，不是 created_at（業務
  //    送出申請的時間，那時候錢還沒真的付出去）。舊資料（這個功能上線
  //    之前就已經核准的請款）payment_method 是 null，維持算不到、不會
  //    突然冒出一筆對不上帳的舊支出。
  for (const item of repairItems) {
    if (item.status !== "approved" || !item.payment_method) continue;
    const date = item.reviewed_at ?? item.created_at;
    if (!isOnOrAfterStart(date)) continue;
    const amount = Number(item.amount ?? 0);
    if (amount <= 0) continue;
    events.push({
      id: `repair:${item.id}`,
      kind: "repair_expense",
      amount: -amount,
      method: item.payment_method,
      date,
      title: `維修/整備請款撥款・${item.item_name}`,
      detail: item.category,
      sourceId: item.id,
    });
  }

  // 4. 公司營運開銷：水電、租金、廣告等固定支出，一律是流出。
  for (const expense of expenses) {
    if (!isOnOrAfterStart(expense.expense_date)) continue;
    const method = expensePaymentToPoolMethod(expense.payment_method);
    const amount = Number(expense.amount ?? 0);
    if (!method || amount <= 0) continue;
    events.push({
      id: `expense:${expense.id}`,
      kind: "company_expense",
      amount: -amount,
      method,
      date: expense.expense_date,
      title: `公司開銷・${expense.title}`,
      sourceId: expense.id,
    });
  }

  // 5. 手動記帳：老闆存入/提領、銀行利息、手續費等其他現金異動。
  for (const item of manual) {
    if (!isOnOrAfterStart(item.date)) continue;
    if (!item.payment_method) continue;
    const amount = Number(item.amount ?? 0);
    if (amount <= 0) continue;
    events.push({
      id: `manual:${item.id}`,
      kind: "manual",
      amount: item.type === "income" ? amount : -amount,
      method: item.payment_method,
      date: item.date,
      title: `手動紀錄・${item.category}`,
      detail: item.note ?? undefined,
      sourceId: item.id,
    });
  }

  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  function totalsFor(method: CashPoolMethod, opening: number | null): CashPoolTotals {
    let inflow = 0;
    let outflow = 0;
    for (const e of events) {
      if (e.method !== method) continue;
      if (e.amount > 0) inflow += e.amount;
      else outflow += -e.amount;
    }
    const openingValue = opening ?? 0;
    return { opening: openingValue, inflow, outflow, balance: openingValue + inflow - outflow };
  }

  return {
    configured: true,
    startedAt,
    cash: totalsFor("cash", cashOpening),
    bank: totalsFor("bank", bankOpening),
    timeline: events,
  };
}
