// 「收支明細」——把 deals（成交收款）／cars（進貨付款）／repair_items
// （維修/整備請款撥款）／company_expenses（公司開銷）／transactions
// （手動記帳）五個來源裡，「有指定金流帳戶」（account_id 系列欄位）的
// 紀錄，依帳戶分組、算出每個帳戶目前的收支明細跟餘額。純函式、不碰
// 資料庫，跟 cash-pool.ts 的寫法/風格一致，方便之後維護跟補測試。
//
// 這是「金流架構方案一」的最後一塊拼圖，跟舊版「資金總覽」（現金／銀行
// 兩池，見 cash-pool.ts）是兩個獨立、並存的系統，彼此不會互相影響：
// - 舊版水池：只分「現金／銀行」兩池，全車行共用同一個手動設定的
//   「起算點」（cash_pool_started_at），起算點之前的舊資料完全不看。
// - 這裡（新版多帳戶）：帳戶可以有很多個（每個銀行帳戶各自一筆），各自
//   有自己的「期初餘額」（financial_accounts.opening_balance，帳戶建立
//   當下設定一次），沒有共用起算點的概念——凡是一筆紀錄「有標記」選了
//   這個帳戶，不分日期一律算進這個帳戶的收支明細裡；沒有標記帳戶的紀錄
//   （不管是新資料使用者沒選、還是这个功能上線之前的舊資料），兩個系統
//   都一樣算不到，這正是安安要的「舊資料不用回填、新舊並存、互不影響」
//   的設計，見這次金流架構開頭的討論。
import type { Car, CompanyExpense, Deal, FinancialAccount, RepairItem, Transaction } from "./supabase/types";

export type LedgerEventKind = "deal_income" | "car_expense" | "repair_expense" | "company_expense" | "manual";

export interface LedgerEvent {
  id: string;
  kind: LedgerEventKind;
  accountId: string;
  /** 正數＝流入這個帳戶，負數＝流出。 */
  amount: number;
  date: string;
  title: string;
  detail?: string;
  /** 給畫面「查看原始紀錄」用（例如車輛/合約 id），目前只有內部用途。 */
  sourceId: string;
  /** 2026-09-05 新增：只有 kind === "manual" 才可能有值——這筆手動記帳
   * 是否已被作廢／本身是不是一筆沖銷列，見 cash-pool-actions.ts 的
   * voidManualCashTransaction() 開頭說明。畫面用這兩個欄位顯示「已作廢」
   * ／「沖銷」徽章，並且只有「正常、未作廢、不是沖銷列」的手動記帳才會
   * 顯示「作廢」按鈕。 */
  isVoided?: boolean;
  isReversal?: boolean;
}

export interface AccountLedger {
  account: FinancialAccount;
  opening: number;
  inflow: number;
  outflow: number;
  balance: number;
  /** 由新到舊排序，只含這個帳戶的紀錄。 */
  events: LedgerEvent[];
}

// 2026-09-05：改成 export，讓 financial-accounts-module.tsx 可以直接重用
// 這幾個 Pick 型別當自己 props 的型別，不用在畫面元件裡重複寫一次一模
// 一樣的欄位清單（原本這幾個只有這個檔案內部用，沒有 export）。
export type DealSlice = Pick<
  Deal,
  | "id"
  | "customer_name"
  | "deposit_amount"
  | "balance_amount"
  | "deposit_account_id"
  | "balance_account_id"
  | "status"
  | "created_at"
  | "delivered_at"
>;
export type CarSlice = Pick<Car, "id" | "brand" | "model_name" | "purchase_price" | "purchase_account_id" | "created_at">;
export type RepairItemSlice = Pick<
  RepairItem,
  "id" | "item_name" | "category" | "amount" | "status" | "account_id" | "reviewed_at" | "created_at"
>;
export type CompanyExpenseSlice = Pick<CompanyExpense, "id" | "title" | "amount" | "account_id" | "expense_date">;
export type ManualTransactionSlice = Pick<
  Transaction,
  "id" | "type" | "amount" | "account_id" | "date" | "category" | "note" | "voided_at" | "reversed_transaction_id"
>;

/**
 * 把五個來源攤平成一份「有標記帳戶」的事件清單，再依帳戶分組、算出各自
 * 的期初餘額／累計入帳／累計出帳／目前餘額。回傳陣列的順序跟傳入的
 * `accounts` 一致（呼叫端已經排好現金優先、銀行照建立順序，這裡不重排）。
 */
export function computeFinancialLedger(params: {
  accounts: FinancialAccount[];
  deals: DealSlice[];
  cars: CarSlice[];
  repairItems: RepairItemSlice[];
  expenses: CompanyExpenseSlice[];
  manual: ManualTransactionSlice[];
  /** 2026-09-05 新增：選填的日期區間（YYYY-MM-DD，頭尾都含）——不給就是
   * 全部歷史（原本的行為）。有給的話，「期初餘額」會改成「區間開始前」
   * 累加到的餘額（不是帳戶原始的 opening_balance），「期末餘額」（也就是
   * 回傳的 balance 欄位）則是累加到區間結束當天為止的餘額，累計入帳／
   * 出帳／events 也都只算區間內那一段——跟 Hocar「帳戶收支明細」報表的
   * 日期篩選是同一個概念。start/end 任一個給 null 表示那一邊不設界線。 */
  dateRange?: { start: string | null; end: string | null };
}): AccountLedger[] {
  const { accounts, deals, cars, repairItems, expenses, manual, dateRange } = params;

  const events: LedgerEvent[] = [];

  // 1. 成交收款：訂金／尾款各自可能指定不同帳戶，拆成最多兩筆事件，跟
  //    cash-pool.ts 的訂金/尾款拆法一致（訂金：已簽約/已交車都算；
  //    尾款：只有已交車才算，日期用真正交車日 delivered_at）。
  for (const deal of deals) {
    const depositReceived = deal.status === "signed" || deal.status === "delivered";
    const depositAmount = Number(deal.deposit_amount ?? 0);
    if (depositReceived && depositAmount > 0 && deal.deposit_account_id) {
      events.push({
        id: `deal:${deal.id}:deposit`,
        kind: "deal_income",
        accountId: deal.deposit_account_id,
        amount: depositAmount,
        date: deal.created_at,
        title: `成交收款・${deal.customer_name}`,
        detail: "訂金",
        sourceId: deal.id,
      });
    }

    const balanceDate = deal.delivered_at ?? deal.created_at;
    const balanceAmount = Number(deal.balance_amount ?? 0);
    if (deal.status === "delivered" && balanceAmount > 0 && deal.balance_account_id) {
      events.push({
        id: `deal:${deal.id}:balance`,
        kind: "deal_income",
        accountId: deal.balance_account_id,
        amount: balanceAmount,
        date: balanceDate,
        title: `成交收款・${deal.customer_name}`,
        detail: "尾款",
        sourceId: deal.id,
      });
    }
  }

  // 2. 進貨付款：買車付出去的錢，一律是流出。
  for (const car of cars) {
    if (!car.purchase_account_id) continue;
    const amount = Number(car.purchase_price ?? 0);
    if (amount <= 0) continue;
    events.push({
      id: `car:${car.id}`,
      kind: "car_expense",
      accountId: car.purchase_account_id,
      amount: -amount,
      date: car.created_at,
      title: `進貨付款・${car.brand ? `${car.brand} ` : ""}${car.model_name}`,
      sourceId: car.id,
    });
  }

  // 3. 維修/整備請款撥款：只有「已核准」才是真的撥款出去，日期用核准
  //    時間（reviewed_at），沒有的話退回 created_at。
  for (const item of repairItems) {
    if (item.status !== "approved" || !item.account_id) continue;
    const amount = Number(item.amount ?? 0);
    if (amount <= 0) continue;
    events.push({
      id: `repair:${item.id}`,
      kind: "repair_expense",
      accountId: item.account_id,
      amount: -amount,
      date: item.reviewed_at ?? item.created_at,
      title: `維修/整備請款撥款・${item.item_name}`,
      detail: item.category,
      sourceId: item.id,
    });
  }

  // 4. 公司營運開銷：一律是流出。
  for (const expense of expenses) {
    if (!expense.account_id) continue;
    const amount = Number(expense.amount ?? 0);
    if (amount <= 0) continue;
    events.push({
      id: `expense:${expense.id}`,
      kind: "company_expense",
      accountId: expense.account_id,
      amount: -amount,
      date: expense.expense_date,
      title: `公司開銷・${expense.title}`,
      sourceId: expense.id,
    });
  }

  // 5. 手動記帳：老闆存入/提領、銀行利息、手續費等，收入/支出都可能。
  //    2026-09-05：作廢的原始列跟它的沖銷列都照樣列進來（不篩掉）——
  //    兩筆都是真的動過餘額的紀錄，金額互相抵銷，加總起來自然還是對的，
  //    只是畫面上要清楚標示哪筆是作廢、哪筆是沖銷，見 isVoided/isReversal。
  for (const tx of manual) {
    if (!tx.account_id) continue;
    const amount = Number(tx.amount ?? 0);
    if (amount <= 0) continue;
    events.push({
      id: `manual:${tx.id}`,
      kind: "manual",
      accountId: tx.account_id,
      amount: tx.type === "income" ? amount : -amount,
      date: tx.date,
      title: `手動紀錄・${tx.category}`,
      detail: tx.note ?? undefined,
      sourceId: tx.id,
      isVoided: !!tx.voided_at,
      isReversal: !!tx.reversed_transaction_id,
    });
  }

  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const start = dateRange?.start ?? null;
  const end = dateRange?.end ?? null;

  return accounts.map((account) => {
    const allAccountEvents = events.filter((e) => e.accountId === account.id);
    const trueOpening = Number(account.opening_balance ?? 0);

    // 沒有日期區間：維持原本的「全部歷史」行為，期初餘額就是帳戶的
    // opening_balance，events 是全部紀錄。
    if (!start && !end) {
      let inflow = 0;
      let outflow = 0;
      for (const e of allAccountEvents) {
        if (e.amount > 0) inflow += e.amount;
        else outflow += -e.amount;
      }
      return {
        account,
        opening: trueOpening,
        inflow,
        outflow,
        balance: trueOpening + inflow - outflow,
        events: allAccountEvents,
      };
    }

    // 有日期區間：期初餘額＝opening_balance 加上「區間開始之前」全部
    // 紀錄的加總（start 沒給就代表沒有下界，所有更早的紀錄都算進期初）；
    // 區間內（>= start 且 <= end，任一邊沒給就不設界線）的紀錄才計入
    // 這次的累計入帳／出帳／events，期末餘額＝期初＋這段區間的淨變動。
    let periodOpening = trueOpening;
    const periodEvents: LedgerEvent[] = [];
    for (const e of allAccountEvents) {
      const d = e.date.slice(0, 10);
      const beforeStart = start ? d < start : false;
      if (beforeStart) {
        periodOpening += e.amount;
        continue;
      }
      const afterEnd = end ? d > end : false;
      if (afterEnd) continue;
      periodEvents.push(e);
    }
    let inflow = 0;
    let outflow = 0;
    for (const e of periodEvents) {
      if (e.amount > 0) inflow += e.amount;
      else outflow += -e.amount;
    }
    return {
      account,
      opening: periodOpening,
      inflow,
      outflow,
      balance: periodOpening + inflow - outflow,
      events: periodEvents,
    };
  });
}

/** 2026-09-05 新增：每日對帳報表專用——算出某個帳戶「截至某一天為止
 * （含當天）」系統應該有的餘額，拿去跟人工實際盤點的 counted_balance
 * 比對差額。就是 computeFinancialLedger 帶 dateRange={start:null,end:date}
 * 只看單一帳戶時的 balance，抽成一支小函式方便報表頁面逐日呼叫。 */
export function computeAccountBalanceAsOf(
  accountId: string,
  asOfDate: string,
  params: Omit<Parameters<typeof computeFinancialLedger>[0], "dateRange" | "accounts"> & { accounts: FinancialAccount[] }
): number {
  const ledgers = computeFinancialLedger({ ...params, dateRange: { start: null, end: asOfDate } });
  return ledgers.find((l) => l.account.id === accountId)?.balance ?? 0;
}
