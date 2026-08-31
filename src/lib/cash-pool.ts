// 「資金總覽」現金流水池的共用邏輯：把分散在 deals（成交收款）／cars
// （進貨付款）／company_expenses（公司開銷）／transactions（手動記帳，
// 這張表本來就存在但一直沒被用到）四個地方的金流，換算成「現金水池」跟
// 「銀行水池」兩個數字。純函式、不碰資料庫，Client Component（畫面）跟
// 未來如果要在 Server Component 算一次都能重複使用，也方便之後補測試。
//
// 核心概念：水池不是从系统一开始就有的、完整的歷史流水帳——車行過去的
// 現金/銀行餘額系統並不知道，所以需要車行管理員先手動設定一個「起算點」
// （見 cash_pool_started_at），從那天（含）開始，之後每一筆新發生的成交
// 收款／開銷／進貨付款／手動紀錄才會被算進水池增減；起算日之前的舊資料
// 完全不看，因為那些已經反映在管理員自己輸入的「期初餘額」裡了。
import type { Car, CashPoolMethod, CompanyExpense, Deal, Transaction } from "./supabase/types";

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

export type CashPoolEventKind = "deal_income" | "car_expense" | "company_expense" | "manual";

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
  /** 由新到舊排序，合併四個來源的完整流水。 */
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
    | "customer_name"
  >[];
  cars: Pick<Car, "id" | "paid_amount" | "payment_method" | "created_at" | "brand" | "model_name">[];
  expenses: Pick<CompanyExpense, "id" | "amount" | "payment_method" | "expense_date" | "title">[];
  manual: Pick<Transaction, "id" | "type" | "amount" | "payment_method" | "date" | "category" | "note">[];
}): CashPoolSummary {
  const { cashOpening, bankOpening, startedAt, deals, cars, expenses, manual } = params;

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

    const balanceAmount = Number(deal.balance_amount ?? 0);
    if (deal.status === "delivered" && balanceAmount > 0 && deal.balance_payment_method) {
      events.push({
        id: `deal:${deal.id}:balance`,
        kind: "deal_income",
        amount: balanceAmount,
        method: deal.balance_payment_method,
        date: deal.created_at,
        title: `成交收款・${deal.customer_name}`,
        detail: "尾款",
        sourceId: deal.id,
      });
    }
  }

  // 2. 進貨付款：買車付給前車主／代結清貸款銀行的錢，是水池的流出。
  for (const car of cars) {
    if (!isOnOrAfterStart(car.created_at)) continue;
    const method = carPaymentToPoolMethod(car.payment_method);
    const amount = Number(car.paid_amount ?? 0);
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

  // 3. 公司營運開銷：水電、租金、廣告等固定支出，一律是流出。
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

  // 4. 手動記帳：老闆存入/提領、銀行利息、手續費等其他現金異動。
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
