"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CashPoolModule } from "../_components/cash-pool-module";
import { PayrollModule } from "../_components/payroll-module";
import { ProfitShareModule } from "../_components/profit-share-module";
import { getEffectivePermissions } from "@/lib/permissions";
import type { Profile, RepairItemCategory, Tenant } from "@/lib/supabase/types";
// 2026-09-04：新增/刪除公司開銷改成呼叫這兩支 Server Action（原本這個
// 分頁自己另外用 supabase client 直接寫資料庫，繞過了這兩支已經寫好
// 權限檢查＋鈴鐺通知的 action，見這兩支 function 開頭的說明）。
import { createCompanyExpense, deleteCompanyExpense } from "../company-expenses-actions";
// 2026-09-04 新增：帳戶管理分頁，見 financial-accounts-actions.ts 開頭的
// 說明——「金流架構方案一」第一步，附加式新增，不影響既有任何分頁。
import { FinancialAccountsModule } from "../_components/financial-accounts-module";
import type { AccountReconciliation, FinancialAccount } from "@/lib/supabase/types";
// 2026-09-05 新增：每日對帳報表，見 daily-reconciliation-module.tsx 開頭
// 的說明——「金流架構方案一」最後一塊，跟帳戶管理／收支明細一樣是附加式
// 新增，不影響既有任何分頁。
import { DailyReconciliationModule } from "../_components/daily-reconciliation-module";
// 2026-09-04 新增：「收支明細」——把五個來源裡有標記帳戶的紀錄依帳戶
// 分組算出收支明細跟餘額，見 financial-ledger.ts 開頭的說明。2026-09-05
// 起改成把原始五個來源直接傳給 FinancialAccountsModule，讓它自己視日期
// 篩選內部呼叫 computeFinancialLedger()（一次全歷史算「目前餘額」、一次
// 帶 dateRange 算篩選後的收支明細），這裡不用再自己呼叫一次。
// 2026-09-05 新增：「公積金」——進貨訂金（未來要付出去的錢）／客戶
// 預訂訂金（未來會收進來的錢），見 vehicle-pipeline-module.tsx 開頭的
// 說明。這是一張全新的獨立表 vehicle_pipeline_entries，刻意不碰
// cars/deals，車真的回來了還是走既有「新增車輛」流程手動建檔。
import { VehiclePipelineModule } from "../_components/vehicle-pipeline-module";
import type { VehiclePipelineEntry } from "@/lib/supabase/types";

type CashPoolCar = {
  id: string;
  brand: string | null;
  model_name: string;
  // 2026-08-31：「資金總覽」水池的進貨付款金額改讀 purchase_price（真正
  // 認列成本、必填），不再讀容易被忘記填的 paid_amount——見
  // cash-pool.ts 開頭的說明。
  purchase_price: number;
  payment_method: "bank_transfer" | "debt_settlement" | "cash" | null;
  /** 2026-09-04 新增：這筆進貨付款選填指定的金流帳戶（新版多帳戶架構，
   * 見 financial-ledger.ts 開頭的說明）。 */
  purchase_account_id: string | null;
  created_at: string;
  /** 這輛車結帳（售出）封存的當下時間——「薪資單」分頁拿這個欄位判斷
   * 業務抽成算哪個月，因為安安希望是「當月結案、當月發」。null 表示
   * 這輛車還沒結案。「淨利／分潤試算」分頁也是拿這個欄位判斷月份歸屬。 */
  closed_at: string | null;
  /** 以下三個欄位「淨利／分潤試算」分頁專用，其餘分頁不會用到——車輛
   * 實際成交價、掛牌價、結帳當下的總成本快照，見 profit-share-module.tsx
   * 開頭的淨利公式說明。 */
  status: string;
  final_price: number | null;
  selling_price: number | null;
  closed_total_cost: number | null;
};

type PayrollDeal = {
  id: string;
  car_id: string;
  customer_name: string;
  final_price: number;
  deposit_amount: number | null;
  balance_amount: number | null;
  // 2026-08-31：訂金／尾款分開記錄收款方式，取代舊版單一 payment_method
  // （見 deals-actions.ts／cash-pool.ts 的說明）。
  deposit_payment_method: "cash" | "bank" | null;
  balance_payment_method: "cash" | "bank" | null;
  /** 2026-09-04 新增：訂金/尾款選填指定的金流帳戶（新版多帳戶架構），
   * 見 financial-ledger.ts 開頭的說明。 */
  deposit_account_id: string | null;
  balance_account_id: string | null;
  status: "draft" | "signed" | "delivered";
  salesperson_id: string | null;
  commission_amount: number | null;
  created_at: string;
  /** 2026-08-31 新增：合約第一次交車的時間戳記——「資金總覽」水池的
   * 尾款事件改用這個判斷起算點/顯示日期，不再誤用合約建立日
   * （created_at），見 cash-pool.ts 開頭的說明。 */
  delivered_at: string | null;
};

type ManualTransaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  payment_method: "cash" | "bank" | null;
  date: string;
  category: string;
  note: string | null;
  /** 2026-09-04 新增：選填指定的金流帳戶（新版多帳戶架構），見
   * financial-ledger.ts 開頭的說明。 */
  account_id: string | null;
  /** 2026-09-05 新增：作廢＋沖銷機制，取代直接刪除——見
   * cash-pool-actions.ts 的 voidManualCashTransaction() 開頭說明，跟
   * supabase/types.ts 的 Transaction 型別保持一致。這兩個欄位原本漏加在
   * 這裡（這個檔案自己另外定義了一份精簡版的 ManualTransaction，沒有直接
   * 用 supabase/types.ts 的 Transaction），導致 cash-pool-module.tsx／
   * financial-ledger.ts 那邊要求的 Pick<Transaction, ...> 型別對不起來，
   * build 會直接失敗（TS2322）。 */
  voided_at: string | null;
  reversed_transaction_id: string | null;
};

/** 2026-08-31 新增：「資金總覽」水池要用的請款撥款資料——只挑會計核准
 * 撥款當下才會有值的欄位，跟「維修請款與會計」分頁另外撈的完整
 * RepairItem 資料是分開的兩份查詢（那份在 dashboard/page.tsx，這裡的
 * accounting/page.tsx 是獨立的 client component，本來就各自撈自己
 * 需要的資料，不共用）。 */
type CashPoolRepairItem = {
  id: string;
  car_id: string;
  item_name: string;
  category: RepairItemCategory;
  amount: number;
  status: "pending" | "approved" | "rejected";
  payment_method: "cash" | "bank" | null;
  reviewed_at: string | null;
  created_at: string;
  /** 2026-09-04 新增：核准撥款時選填指定的金流帳戶（新版多帳戶架構），
   * 見 financial-ledger.ts 開頭的說明。 */
  account_id: string | null;
};

type StaffOption = { id: string; name: string | null };

type CashPoolProfile = Pick<
  Profile,
  | "id"
  | "role"
  | "can_view_cost"
  | "can_view_salary"
  | "can_edit_cars"
  | "can_view_all_salary"
  | "can_approve_repairs"
  | "can_manage_finance"
  | "can_view_analytics"
  | "tenant_id"
>;
type CashPoolTenant = Pick<
  Tenant,
  | "cash_opening_balance"
  | "bank_opening_balance"
  | "cash_pool_started_at"
  | "profit_share_enabled"
  | "profit_share_equity_percent"
>;

type CompanyExpense = {
  id: string;
  expense_date: string;
  category: string;
  title: string;
  amount: number;
  payment_method: string;
  payer_name: string | null;
  invoice_number: string | null;
  /** 這筆開銷（主要是「人事薪資」類別）發給哪位員工——給「薪資單」分頁
   * 自動加總這個人的底薪用，見 payroll-module.tsx。其餘類別留 null。 */
  employee_profile_id: string | null;
  note: string | null;
  /** 2026-09-04 新增：這筆開銷是從哪個金流帳戶付出去的，見
   * financial-accounts-actions.ts 開頭的說明。選填，NULL＝尚未指定。 */
  account_id: string | null;
};

/** 公司開銷費用類別，2026-08-31 起改成每個車行自己可以新增/刪除的清單
 * （company_expense_categories 表），不再是寫死在程式碼裡的固定選項。
 * is_protected=true 的「人事薪資」不能被刪除，見下面 DEFAULT_EXPENSE_
 * CATEGORIES 跟 handleDeleteCategory() 的說明。 */
type ExpenseCategory = {
  id: string;
  name: string;
  is_protected: boolean;
  sort_order: number;
};

/** 新車行第一次進「公司營運開銷」分頁、資料庫裡還沒有任何類別列時，
 * 自動幫這個車行種下的預設類別——跟過去寫死的 7 個類別完全一樣，只是
 * 現在種進資料庫、之後車行自己可以再新增/刪除。「人事薪資」一定要保留
 * is_protected: true，因為薪資單／淨利分潤試算是用這個字串完全比對來
 * 抓底薪/獎金，被刪掉或改名那兩個功能就會漏算，所以不開放刪除。 */
const DEFAULT_EXPENSE_CATEGORIES: { name: string; is_protected: boolean }[] = [
  { name: "水電費", is_protected: false },
  { name: "網路通訊", is_protected: false },
  { name: "場地租金", is_protected: false },
  { name: "廣告行銷", is_protected: false },
  { name: "人事薪資", is_protected: true },
  { name: "行政雜項", is_protected: false },
  { name: "專業服務", is_protected: false },
];

export default function AccountingPage() {
  const supabase = createClient();
  // 2026-09-04 新增：讓「新增了一個金流帳戶」通知的連結
  // （/dashboard/accounting?module=accounts）點下去真的能直接跳到帳戶
  // 管理分頁，不是只是導到這一頁又要自己再點一次分頁——這個頁面在這之前
  // 完全沒有讀網址參數，分頁純粹是內部 state，跟側邊欄那套用 URL 深連結
  // 的做法（dashboard-shell.tsx）不一樣。這裡不整套改成 URL 驅動，只加這
  // 一個小掛勾：有帶 module=accounts 參數、而且確認有財務權限，就把分頁
  // 切過去，避免動到其餘分頁既有的行為。這個路由所在的 /dashboard 整棵
  // 樹已經因為 layout.tsx 呼叫 requireTenantUser()（讀 cookie）而是動態
  // 路由，這裡用 useSearchParams 不會有靜態預渲染衝突的問題。
  const searchParams = useSearchParams();
  // 2026-08-31：安安要求「資金總覽」比「公司營運開銷」更重要，要排在
  // 前面——預設分頁從 "company" 改成 "summary"，下面的分頁按鈕順序也
  // 跟著對調（見下方 JSX），兩處要一起改，不然預設打開的分頁跟按鈕排列
  // 順序會對不起來。
  const [activeTab, setActiveTab] = useState<
    "company" | "summary" | "payroll" | "profitShare" | "accounts" | "reconciliation" | "vehiclePipeline"
  >("summary");
  const [expenses, setExpenses] = useState<CompanyExpense[]>([]);
  const [loading, setLoading] = useState(true);
  // 帳戶管理分頁用的帳戶清單，見 financial-accounts-module.tsx。
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  // 2026-09-05 新增：每日對帳報表用的盤點紀錄，見
  // daily-reconciliation-module.tsx。
  const [accountReconciliations, setAccountReconciliations] = useState<AccountReconciliation[]>([]);
  // 2026-09-05 新增：公積金分頁用的紀錄清單，見 vehicle-pipeline-module.tsx。
  const [vehiclePipelineEntries, setVehiclePipelineEntries] = useState<VehiclePipelineEntry[]>([]);

  // 2026-08-29：這整頁（公司開銷／資金總覽／薪資單／淨利分潤）以前完全
  // 沒有頁面層級的權限檢查——任何登入的員工只要知道 /dashboard/accounting
  // 這個網址，就能看到全公司的開銷跟薪資紀錄，跟「老闆／會計／店長／
  // 員工」要分級的目標互相矛盾。現在分兩層：
  //   - canManageFinance（老闆／會計預設 true）：四個分頁全部看得到。
  //   - canViewSalary 但沒有 canManageFinance（一般員工/店長預設情況）：
  //     只留「薪資單」分頁（看自己的底薪/抽成），「公司營運開銷」「資金
  //     總覽」「淨利分潤」這三個真正屬於「會計/財務」的分頁整個隱藏，
  //     分頁按鈕都不會出現。
  //   - 兩者都沒有：整頁顯示「沒有權限」，不會呼叫下面任何一支查詢，
  //     瀏覽器不會收到任何一筆薪資/開銷資料。
  const [financeAccessChecked, setFinanceAccessChecked] = useState(false);
  const [hasFinanceAccess, setHasFinanceAccess] = useState(false);
  const [hasPayrollOnlyAccess, setHasPayrollOnlyAccess] = useState(false);

  // 「資金總覽」水池／「薪資單」都要用的額外資料——跟這個頁面原本查
  // company_expenses 同一套「client 端直接查、靠 RLS 自動限定自己車行」
  // 的作法，見 cash-pool-module.tsx / payroll-module.tsx。
  const [cashPoolProfile, setCashPoolProfile] = useState<CashPoolProfile | null>(null);
  const [cashPoolTenant, setCashPoolTenant] = useState<CashPoolTenant | null>(null);
  const [cashPoolCars, setCashPoolCars] = useState<CashPoolCar[]>([]);
  const [payrollDeals, setPayrollDeals] = useState<PayrollDeal[]>([]);
  const [manualTransactions, setManualTransactions] = useState<ManualTransaction[]>([]);
  // 2026-08-31 新增：已核准的維修/整備請款撥款——「資金總覽」水池深度
  // 檢查後補上的第五個資料來源，見 cash-pool.ts 開頭的說明。
  const [cashPoolRepairItems, setCashPoolRepairItems] = useState<CashPoolRepairItem[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);

  // 表單 State
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState("水電費");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("匯款");
  const [payerName, setPayerName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [employeeProfileId, setEmployeeProfileId] = useState("");
  // 2026-09-04 新增：選填，這筆開銷是從哪個金流帳戶付出去的。
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 費用類別清單（自訂類別功能）
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  // 載入公司開銷列表
  const fetchExpenses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("company_expenses")
      .select("*")
      .order("expense_date", { ascending: false });

    if (!error && data) {
      setExpenses(data);
    }
    setLoading(false);
  };

  // 載入這個車行自己的費用類別清單；如果這個車行是第一次進來、資料庫裡
  // 還完全沒有任何一筆類別（新車行、或這次功能上線之前就存在但還沒被
  // migration 種過），就自動幫它種下 DEFAULT_EXPENSE_CATEGORIES 這 7 個
  // 預設類別再重新查一次，讓下拉選單一定看得到東西可以選，不會是空的。
  const fetchCategories = useCallback(
    async (tenantId: string) => {
      const { data, error } = await supabase
        .from("company_expense_categories")
        .select("id, name, is_protected, sort_order")
        .order("sort_order", { ascending: true });

      if (error) {
        setCategoriesLoaded(true);
        return;
      }

      if (data && data.length > 0) {
        setCategories(data as ExpenseCategory[]);
        setCategoriesLoaded(true);
        return;
      }

      // 空清單：種預設值。
      const { error: seedError } = await supabase.from("company_expense_categories").insert(
        DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({
          tenant_id: tenantId,
          name: c.name,
          is_protected: c.is_protected,
          sort_order: i,
        }))
      );

      if (!seedError) {
        const { data: seeded } = await supabase
          .from("company_expense_categories")
          .select("id, name, is_protected, sort_order")
          .order("sort_order", { ascending: true });
        if (seeded) setCategories(seeded as ExpenseCategory[]);
      }
      setCategoriesLoaded(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // 資金總覽／薪資單需要的資料：目前使用者的權限/車行、車行起算點設定、
  // 全體員工名單、以及成交合約(deals)／進貨付款(cars)／手動記帳
  // (transactions) 三個來源，全部算在同一個 fetch 裡，供新增/刪除紀錄後
  // 重新呼叫來刷新畫面。
  const fetchSharedData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profileData } = await supabase
      .from("profiles")
      .select(
        "id, tenant_id, role, can_view_cost, can_view_salary, can_edit_cars, can_view_all_salary, can_approve_repairs, can_manage_finance, can_view_analytics"
      )
      .eq("id", user.id)
      .single();
    if (profileData) setCashPoolProfile(profileData as CashPoolProfile);

    const effective = profileData ? getEffectivePermissions(profileData as CashPoolProfile) : null;
    const allowed = !!effective?.canManageFinance;
    const payrollOnly = !allowed && !!effective?.canViewSalary;
    setHasFinanceAccess(allowed);
    setHasPayrollOnlyAccess(payrollOnly);
    setFinanceAccessChecked(true);
    if (!allowed && !payrollOnly) return false;
    // payrollOnly 的話把分頁鎖定在「薪資單」，不讓網址列 hack 或殘留的
    // activeTab 狀態切到其他三個分頁——那三個分頁的按鈕下面也不會渲染。
    if (payrollOnly) setActiveTab("payroll");

    if (profileData?.tenant_id) {
      const { data: tenantData } = await supabase
        .from("tenants")
        .select(
          "cash_opening_balance, bank_opening_balance, cash_pool_started_at, profit_share_enabled, profit_share_equity_percent"
        )
        .eq("id", profileData.tenant_id)
        .single();
      if (tenantData) setCashPoolTenant(tenantData as CashPoolTenant);

      // 費用類別清單只有「公司營運開銷」分頁（hasFinanceAccess）用得到，
      // 純看自己薪資單的員工（payrollOnly）不需要多查這一次。
      if (allowed) {
        fetchCategories(profileData.tenant_id);
      }
    }

    const [
      { data: carsData },
      { data: dealsData },
      { data: txData },
      { data: staffData },
      { data: repairData },
      { data: accountsData },
      { data: reconciliationsData },
      { data: pipelineData },
    ] = await Promise.all([
      supabase
        .from("cars")
        .select(
          "id, brand, model_name, purchase_price, payment_method, purchase_account_id, created_at, closed_at, status, final_price, selling_price, closed_total_cost"
        ),
      supabase
        .from("deals")
        .select(
          "id, car_id, customer_name, final_price, deposit_amount, balance_amount, deposit_payment_method, balance_payment_method, deposit_account_id, balance_account_id, status, salesperson_id, commission_amount, created_at, delivered_at"
        ),
      supabase.from("transactions").select("*").order("date", { ascending: false }),
      supabase.from("profiles").select("id, name").order("name"),
      // 2026-08-31 新增：只有「已核准」的請款才可能是真的撥款出去，這裡
      // 撈全部狀態回來（不加 .eq("status","approved")）是因為 pending/
      // rejected 的筆數通常很少，直接交給 computeCashPoolSummary 自己
      // 依 status 過濾即可，不用維護兩套查詢條件。
      supabase
        .from("repair_items")
        .select("id, car_id, item_name, category, amount, status, payment_method, account_id, reviewed_at, created_at"),
      // 2026-09-04 新增：帳戶管理分頁用，見 financial-accounts-module.tsx。
      // 只有 hasFinanceAccess 的人才看得到這個分頁，但這裡跟其他資料一樣
      // 一次查完，靠 RLS 限定只查得到自己車行的帳戶，不特別另外判斷。
      supabase.from("financial_accounts").select("*").order("sort_order", { ascending: true }),
      // 2026-09-05 新增：每日對帳報表用，見 daily-reconciliation-module.tsx。
      supabase.from("account_reconciliations").select("*").order("date", { ascending: false }),
      // 2026-09-05 新增：公積金分頁用，見 vehicle-pipeline-module.tsx。
      supabase.from("vehicle_pipeline_entries").select("*").order("created_at", { ascending: false }),
    ]);
    if (carsData) setCashPoolCars(carsData as CashPoolCar[]);
    if (dealsData) setPayrollDeals(dealsData as PayrollDeal[]);
    if (txData) setManualTransactions(txData as ManualTransaction[]);
    if (staffData) setStaffList(staffData as StaffOption[]);
    if (repairData) setCashPoolRepairItems(repairData as CashPoolRepairItem[]);
    if (accountsData) setFinancialAccounts(accountsData as FinancialAccount[]);
    if (reconciliationsData) setAccountReconciliations(reconciliationsData as AccountReconciliation[]);
    if (pipelineData) setVehiclePipelineEntries(pipelineData as VehiclePipelineEntry[]);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 先確認權限，通過才繼續查公司開銷（company_expenses 裡含「人事薪資」
    // 這種敏感資料）——沒有權限的話 fetchExpenses() 根本不會被呼叫，見上面
    // fetchSharedData() 的說明。
    (async () => {
      const proceed = await fetchSharedData();
      if (proceed) {
        // canViewSalary-only（非 canManageFinance）的人也需要這筆資料——
        // 「薪資單」分頁要從這裡面篩出屬於自己的「人事薪資」項目，見
        // payroll-module.tsx。真正被擋下來的是上面 render 那三個分頁
        // （公司開銷／資金總覽／淨利分潤）跟分頁按鈕本身，不是這支查詢。
        fetchExpenses();
      } else {
        setLoading(false);
      }
    })();
  }, [fetchSharedData]);

  // 網址帶 ?module=accounts（見上面 searchParams 的說明）就切到帳戶管理
  // 分頁——要等權限確認過（hasFinanceAccess）才切，不然沒權限的人網址列
  // 手動加參數也切得過去（畫面上分頁按鈕本來就不會渲染，但這裡多一層
  // 防呆，跟其他分頁一致）。
  useEffect(() => {
    if (searchParams.get("module") === "accounts" && hasFinanceAccess) {
      setActiveTab("accounts");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, hasFinanceAccess]);

  // 類別清單載入完成後，如果目前表單選定的類別（預設值"水電費"，或使用者
  // 剛好刪掉了自己正選著的那個類別）已經不在清單裡，自動改選清單裡第一個
  // 還存在的類別，避免表單卡在一個選不到、也送不出去的空值上。
  useEffect(() => {
    if (!categoriesLoaded || categories.length === 0) return;
    if (!categories.some((c) => c.name === category)) {
      setCategory(categories[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriesLoaded, categories]);

  // 新增開銷
  // 2026-09-04 改法：原本這裡直接呼叫 supabase.from("company_expenses").insert(...)，
  // 繞過了 company-expenses-actions.ts 那支功能完整（權限檢查、金額防呆、
  // 送出後發「新增了一筆公司開銷」鈴鐺通知）的 createCompanyExpense()
  // ——那支 action 一直都有正常運作，只是完全沒有被任何畫面呼叫到，通知
  // 因此從來沒有真的跳出來過。改成把表單欄位包成 FormData 交給那支
  // action 處理，前端只保留「有沒有填」這種即時檢查（不用等一趟網路
  // 來回就能提示），實際的驗證/寫入/通知全部交給 action 那邊統一處理，
  // 不會有兩套邏輯各自維護、容易兜不起來的問題。
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount) {
      alert("請填寫項目名稱與金額");
      return;
    }
    const amountValue = parseFloat(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      alert("金額請填大於 0 的數字。");
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.set("expense_date", expenseDate);
    formData.set("category", category);
    formData.set("title", title);
    formData.set("amount", amount);
    formData.set("payment_method", paymentMethod);
    formData.set("payer_name", payerName);
    formData.set("invoice_number", invoiceNumber);
    formData.set("employee_profile_id", employeeProfileId);
    formData.set("account_id", accountId);
    formData.set("note", note);

    const result = await createCompanyExpense(undefined, formData);

    if (result.error) {
      alert("新增失敗：" + result.error);
    } else {
      alert("成功新增一筆公司開銷！");
      // 清空表單
      setTitle("");
      setAmount("");
      setNote("");
      setInvoiceNumber("");
      setEmployeeProfileId("");
      setAccountId("");
      fetchExpenses();
    }
    setSubmitting(false);
  };

  // 新增自訂費用類別。名稱重複（同一車行內）會被資料庫的 unique
  // constraint 擋下來，這裡轉成友善訊息。
  // 這是分頁裡一個獨立的 type="button" 小按鈕（不是包在自己的
  // <form> 裡），不是表單送出事件，不需要接 FormEvent／preventDefault。
  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    setCategoryError("");
    if (!name) {
      setCategoryError("請輸入類別名稱。");
      return;
    }
    if (!cashPoolProfile?.tenant_id) {
      setCategoryError("找不到目前車行資訊，請重新整理頁面再試一次。");
      return;
    }
    if (categories.some((c) => c.name === name)) {
      setCategoryError("這個類別名稱已經存在了。");
      return;
    }

    setCategorySubmitting(true);
    const { data, error } = await supabase
      .from("company_expense_categories")
      .insert({
        tenant_id: cashPoolProfile.tenant_id,
        name,
        is_protected: false,
        sort_order: categories.length,
      })
      .select("id, name, is_protected, sort_order")
      .single();

    if (error || !data) {
      setCategoryError(
        error?.code === "23505" ? "這個類別名稱已經存在了。" : `新增類別失敗：${error?.message ?? "未知錯誤"}`
      );
    } else {
      setCategories((prev) => [...prev, data as ExpenseCategory]);
      setNewCategoryName("");
    }
    setCategorySubmitting(false);
  };

  // 刪除自訂費用類別——is_protected（目前只有「人事薪資」）不給刪，按鈕
  // 那邊本來就不會顯示，這裡多一層防呆。刪除類別只影響下拉選單以後選不
  // 選得到，不會動到、也不會刪除任何已經用過這個類別名稱的既有開銷紀錄。
  const handleDeleteCategory = async (categoryToDelete: ExpenseCategory) => {
    if (categoryToDelete.is_protected) return;
    if (!confirm(`確定要刪除「${categoryToDelete.name}」這個類別嗎？已經用過這個類別的舊紀錄不會受影響。`)) return;

    const { error } = await supabase.from("company_expense_categories").delete().eq("id", categoryToDelete.id);
    if (error) {
      alert(`刪除類別失敗：${error.message}`);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== categoryToDelete.id));
    // 如果剛好刪到目前表單選定的那個類別，改選第一個還存在的類別，避免
    // 表單卡在一個已經不存在的類別值上。
    setCategory((prev) => (prev === categoryToDelete.name ? "" : prev));
  };

  // 刪除一筆公司開銷——2026-09-04 改成呼叫 company-expenses-actions.ts 的
  // deleteCompanyExpense()，跟新增開銷同一個理由：那支 action 本來就寫好
  // 了權限檢查，這次也補上「刪除了一筆公司開銷」的鈴鐺通知（見該檔案的
  // 說明），改用它才會真的發出通知，不是另外維護一套邏輯。
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const handleDeleteExpense = async (item: CompanyExpense) => {
    if (
      !confirm(
        `確定要刪除這筆開銷嗎？\n\n${item.expense_date}／${item.category}／${item.title}／$${Number(
          item.amount
        ).toLocaleString()}\n\n這個動作無法復原。`
      )
    )
      return;
    setDeletingExpenseId(item.id);
    const result = await deleteCompanyExpense(item.id);
    if (result.error) {
      alert(`刪除失敗：${result.error}`);
    } else {
      setExpenses((prev) => prev.filter((e) => e.id !== item.id));
    }
    setDeletingExpenseId(null);
  };

  // 計算總公司開銷
  const totalCompanyExpenses = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const staffNameById = new Map(staffList.map((s) => [s.id, s.name ?? "未命名"]));
  const accountNameById = new Map(financialAccounts.map((a) => [a.id, a.name]));

  if (!financeAccessChecked) {
    return <p className="p-6 text-center text-sm text-neutral-400">載入中...</p>;
  }

  if (!hasFinanceAccess && !hasPayrollOnlyAccess) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-3xl" aria-hidden>
          🔒
        </p>
        <h1 className="mt-3 text-lg font-semibold text-neutral-900">沒有權限使用這個頁面</h1>
        <p className="mt-2 text-sm text-neutral-500">
          「會計與財務管理」只開放給老闆、會計，或有開啟「檢視個人薪水報表」權限的員工（只能看自己的薪資單），如果你需要使用，請洽車行管理員在「帳號與權限管理」開啟對應權限。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* 頁面標頭 */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">📊 會計與財務管理</h1>
          <p className="text-sm text-neutral-500">獨立管理公司營運開銷與車輛交易財務</p>
        </div>
      </div>

      {/* 分頁 Tab 切換——公司開銷／資金總覽／淨利分潤這三個真正的「會計/
          財務」分頁，只有 hasFinanceAccess（老闆/會計）才看得到按鈕；
          只有 canViewSalary（hasPayrollOnlyAccess）的員工/店長只會看到
          「薪資單」一個分頁，其餘三個按鈕整個不渲染。 */}
      <div className="mb-6 flex border-b border-neutral-200">
        {/* 2026-08-31：安安要求「資金總覽」比「公司營運開銷」更重要，
            按鈕順序對調到最前面（預設開啟的分頁也一併改，見上面 activeTab
            的初始值）。 */}
        {hasFinanceAccess && (
          <button
            onClick={() => setActiveTab("summary")}
            className={`px-5 py-3 font-semibold text-sm transition border-b-2 ${
              activeTab === "summary"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            💰 資金總覽（現金／銀行水位）
          </button>
        )}
        {hasFinanceAccess && (
          <button
            onClick={() => setActiveTab("company")}
            className={`px-5 py-3 font-semibold text-sm transition border-b-2 ${
              activeTab === "company"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            🏢 公司營運開銷 (水電/租金/雜項)
          </button>
        )}
        <button
          onClick={() => setActiveTab("payroll")}
          className={`px-5 py-3 font-semibold text-sm transition border-b-2 ${
            activeTab === "payroll"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          🧾 薪資單
        </button>
        {/* 「淨利／分潤試算」預設關閉，但分頁按鈕本身（給有權限的人）一律
            顯示——沒開啟時點進去會看到啟用引導畫面（見 ProfitShareModule），
            不是直接把分頁藏起來，管理員才找得到「原來這裡可以開」。 */}
        {hasFinanceAccess && (
          <button
            onClick={() => setActiveTab("profitShare")}
            className={`px-5 py-3 font-semibold text-sm transition border-b-2 ${
              activeTab === "profitShare"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            🧮 淨利／分潤試算
          </button>
        )}
        {/* 2026-09-04 新增：帳戶管理，「金流架構方案一」第一步，見
            financial-accounts-module.tsx 開頭的說明。 */}
        {hasFinanceAccess && (
          <button
            onClick={() => setActiveTab("accounts")}
            className={`px-5 py-3 font-semibold text-sm transition border-b-2 ${
              activeTab === "accounts"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            🏦 帳戶管理
          </button>
        )}
        {/* 2026-09-05 新增：每日對帳報表，見
            daily-reconciliation-module.tsx 開頭的說明。 */}
        {hasFinanceAccess && (
          <button
            onClick={() => setActiveTab("reconciliation")}
            className={`px-5 py-3 font-semibold text-sm transition border-b-2 ${
              activeTab === "reconciliation"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            🧮 每日對帳
          </button>
        )}
        {/* 2026-09-05 新增：公積金——進貨訂金／客戶預訂訂金，見
            vehicle-pipeline-module.tsx 開頭的說明。跟這頁其餘會計/財務
            分頁一樣只給 hasFinanceAccess 看得到分頁按鈕——「只看得到自己
            薪資單」的員工（hasPayrollOnlyAccess）在這頁會被鎖定在薪資單
            分頁，沒有進到這個分頁的路徑，所以這裡不額外放寬到
            canEditCars，避免跟既有的 payrollOnly 鎖定行為互相矛盾。
            canRecord/canConfirmDeposit 的細緻權限仍然分開判斷，見下面
            render 分支與 vehicle-pipeline-actions.ts 的伺服器端檢查。 */}
        {hasFinanceAccess && (
          <button
            onClick={() => setActiveTab("vehiclePipeline")}
            className={`px-5 py-3 font-semibold text-sm transition border-b-2 ${
              activeTab === "vehiclePipeline"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            🚗 公積金（進貨／預訂訂金）
          </button>
        )}
      </div>

      {/* 分支 1：公司營運開銷——多一層 hasFinanceAccess 防線，不只靠上面
          按鈕不渲染，避免 activeTab 狀態萬一在某個時間點還沒切回
          payroll 就先渲染出一瞬間的公司開銷內容。 */}
      {hasFinanceAccess && activeTab === "company" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* 左側：新增開銷表單 */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-neutral-900 border-b pb-3 mb-4">
              ➕ 記一筆公司開銷
            </h2>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1">支出日期</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-bold text-neutral-600">費用類別</label>
                  <button
                    type="button"
                    onClick={() => setShowCategoryManager((v) => !v)}
                    className="text-[11px] font-medium text-blue-600 hover:underline"
                  >
                    {showCategoryManager ? "收起管理類別" : "⚙️ 管理類別"}
                  </button>
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {!categoriesLoaded && <option value="">類別載入中…</option>}
                  {categoriesLoaded && categories.length === 0 && <option value="">尚無類別，請先新增</option>}
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {/* 費用類別自己新增/刪除——安安要求可以自己維護這份清單，
                    不再是寫死的固定選項。「人事薪資」是保護類別（薪資單／
                    淨利分潤試算靠這個字串比對計算），不會顯示刪除按鈕。 */}
                {showCategoryManager && (
                  <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    <ul className="space-y-1">
                      {categories.map((c) => (
                        <li key={c.id} className="flex items-center justify-between text-xs text-neutral-700">
                          <span>
                            {c.name}
                            {c.is_protected && (
                              <span className="ml-1.5 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500">
                                系統保護，不可刪除
                              </span>
                            )}
                          </span>
                          {!c.is_protected && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(c)}
                              className="text-neutral-400 hover:text-red-500"
                            >
                              🗑 刪除
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="新類別名稱，例如：尾牙聚餐費"
                        className="flex-1 rounded-lg border border-neutral-300 bg-white p-1.5 text-xs focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={categorySubmitting}
                        onClick={handleAddCategory}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {categorySubmitting ? "新增中…" : "新增"}
                      </button>
                    </div>
                    {categoryError && <p className="mt-1.5 text-[11px] text-red-500">{categoryError}</p>}
                  </div>
                )}
              </div>

              {/* 發給哪位員工：只有「人事薪資」類別才需要，讓「薪資單」分頁
                  能自動把這筆底薪加進對應員工的薪資單。 */}
              {category === "人事薪資" && (
                <div>
                  <label className="block text-xs font-bold text-neutral-600 mb-1">發給員工</label>
                  <select
                    value={employeeProfileId}
                    onChange={(e) => setEmployeeProfileId(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">請選擇員工</option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name ?? "未命名"}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-neutral-400">
                    選了才會自動出現在這位員工的「薪資單」分頁裡，不選也可以照樣存檔，只是薪資單那邊看不到。
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1">項目名稱</label>
                <input
                  type="text"
                  placeholder="例如：7月份展示場電費"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1">金額 (NT$)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-neutral-600 mb-1">付款方式</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="匯款">銀行匯款</option>
                    <option value="現金">零用金/現金</option>
                    <option value="信用卡">公司信用卡</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-600 mb-1">經手/請款人</label>
                  <input
                    type="text"
                    placeholder="經手人"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* 2026-09-04 新增：選填，這筆開銷是從哪個金流帳戶付出去的
                  ——見「帳戶管理」分頁。選填的原因：不想強迫每一筆舊有
                  的記帳流程都要多一個必填欄位才能送出，車行可以自己
                  決定要不要開始使用。開銷是錢從帳戶付出去，標「出帳」
                  而不是「入帳」（見 2026-09-05 安安反映的措辭修正）。 */}
              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1">出帳帳戶 (選填)</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">尚未指定</option>
                  {financialAccounts
                    .filter((a) => a.is_active)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.type === "cash" ? "💵 " : "🏦 "}
                        {a.name}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-[11px] text-neutral-400">
                  選了才會計入「帳戶管理」分頁裡這個帳戶的收支明細，不選也可以照樣存檔。
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1">發票/收據號碼 (選填)</label>
                <input
                  type="text"
                  placeholder="例如：AB12345678"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1">備註 (選填)</label>
                <textarea
                  rows={2}
                  placeholder="補充說明..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-blue-600 py-2.5 font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {submitting ? "儲存中..." : "新增開銷紀錄"}
              </button>
            </form>
          </div>

          {/* 右側：開銷列表歷史 */}
          <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h2 className="text-lg font-bold text-neutral-900">📋 公司營運開銷明細</h2>
              <span className="text-xs font-semibold text-neutral-500">
                累計總支出：<strong className="text-red-600 text-sm">${totalCompanyExpenses.toLocaleString()}</strong>
              </span>
            </div>

            {loading ? (
              <p className="text-center py-8 text-neutral-400 text-sm">資料載入中...</p>
            ) : expenses.length === 0 ? (
              <p className="text-center py-8 text-neutral-400 text-sm">目前尚無公司開銷紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-neutral-50 text-xs font-bold text-neutral-500">
                      <th className="p-3">日期</th>
                      <th className="p-3">類別</th>
                      <th className="p-3">項目名稱</th>
                      <th className="p-3">方式</th>
                      <th className="p-3 text-right">金額</th>
                      <th className="p-3 text-right">
                        <span className="sr-only">操作</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {expenses.map((item) => (
                      <tr key={item.id} className="hover:bg-neutral-50">
                        <td className="p-3 whitespace-nowrap text-neutral-600 text-xs">{item.expense_date}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="rounded bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">
                            {item.category}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-neutral-900">
                          {item.title}
                          {item.employee_profile_id && (
                            <span className="ml-2 rounded bg-[#FBF1E4] px-1.5 py-0.5 text-[11px] font-normal text-[#A6793D]">
                              {staffNameById.get(item.employee_profile_id) ?? "已離職員工"}
                            </span>
                          )}
                          {item.account_id && (
                            <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-normal text-blue-700">
                              {accountNameById.get(item.account_id) ?? "未知帳戶"}
                            </span>
                          )}
                          {item.note && <span className="block text-xs font-normal text-neutral-400">{item.note}</span>}
                        </td>
                        <td className="p-3 whitespace-nowrap text-xs text-neutral-500">{item.payment_method}</td>
                        <td className="p-3 text-right font-bold text-red-600 whitespace-nowrap">
                          -${Number(item.amount).toLocaleString()}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(item)}
                            disabled={deletingExpenseId === item.id}
                            className="text-xs font-medium text-neutral-400 hover:text-red-600 disabled:opacity-40"
                          >
                            {deletingExpenseId === item.id ? "刪除中…" : "🗑 刪除"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 分支 2：資金總覽（現金／銀行水池） */}
      {hasFinanceAccess && activeTab === "summary" && (
        <CashPoolModule
          tenant={cashPoolTenant}
          // 「能編輯起算點設定」的資格，2026-08-29 起從「只有老闆」放寬成
          // 「老闆或有 canManageFinance 的會計」——名稱維持 isTenantAdmin
          // 沒有改，語意上等同「這個財務頁面的管理者」。
          isTenantAdmin={!!cashPoolProfile && getEffectivePermissions(cashPoolProfile).canManageFinance}
          canViewCost={!!cashPoolProfile && getEffectivePermissions(cashPoolProfile).canViewCost}
          deals={payrollDeals}
          cars={cashPoolCars}
          expenses={expenses.map((e) => ({
            id: e.id,
            amount: e.amount,
            payment_method: e.payment_method,
            expense_date: e.expense_date,
            title: e.title,
          }))}
          manualTransactions={manualTransactions}
          repairItems={cashPoolRepairItems}
          financialAccounts={financialAccounts.filter((a) => a.is_active)}
          onDataChanged={fetchSharedData}
        />
      )}

      {/* 分支 3：薪資單（底薪 + 抽成，按月份/員工看） */}
      {activeTab === "payroll" && (
        <PayrollModule
          staff={staffList}
          deals={payrollDeals}
          cars={cashPoolCars}
          expenses={expenses}
          // 「看得到全部人的薪資單」現在不是只有老闆——會計預設也看得到
          // （canViewAllSalary），店長/員工預設看不到、只看自己的，見
          // src/lib/permissions.ts 的 ROLE_DEFAULT_PERMISSIONS。
          canManageStaff={
            !!cashPoolProfile &&
            (getEffectivePermissions(cashPoolProfile).canManageStaff ||
              getEffectivePermissions(cashPoolProfile).canViewAllSalary)
          }
          canViewSalary={!!cashPoolProfile && getEffectivePermissions(cashPoolProfile).canViewSalary}
          currentUserId={cashPoolProfile?.id ?? null}
        />
      )}

      {/* 分支 4：淨利／分潤試算——只給有股東/合夥人分潤安排的車行用，
          預設關閉，見 profit-share-module.tsx 開頭的說明。 */}
      {hasFinanceAccess && activeTab === "profitShare" && cashPoolTenant && (
        <ProfitShareModule
          tenant={cashPoolTenant}
          cars={cashPoolCars}
          expenses={expenses}
          isTenantAdmin={!!cashPoolProfile && getEffectivePermissions(cashPoolProfile).canManageFinance}
          canViewFinancials={
            !!cashPoolProfile &&
            getEffectivePermissions(cashPoolProfile).canViewCost &&
            getEffectivePermissions(cashPoolProfile).canViewSalary
          }
          onSettingsChanged={fetchSharedData}
        />
      )}

      {/* 分支 5：帳戶管理——「金流架構方案一」，見
          financial-accounts-module.tsx 開頭的說明。2026-09-04 新增：五個
          來源全部接上帳戶欄位之後，「收支明細」改用 computeFinancialLedger()
          （見 financial-ledger.ts）一次算出每個帳戶完整的收支明細跟餘額，
          取代原本只看公司開銷的簡易/不完整版本。 */}
      {hasFinanceAccess && activeTab === "accounts" && (
        <FinancialAccountsModule
          accounts={financialAccounts}
          canManage={hasFinanceAccess}
          onDataChanged={fetchSharedData}
          deals={payrollDeals}
          cars={cashPoolCars}
          repairItems={cashPoolRepairItems}
          expenses={expenses}
          manual={manualTransactions}
        />
      )}

      {/* 分支 6：每日對帳報表，見 daily-reconciliation-module.tsx 開頭的
          說明。只給還在使用中的帳戶——停用的帳戶不用每天盤點。 */}
      {hasFinanceAccess && activeTab === "reconciliation" && (
        <DailyReconciliationModule
          accounts={financialAccounts.filter((a) => a.is_active)}
          reconciliations={accountReconciliations}
          canManage={hasFinanceAccess}
          onDataChanged={fetchSharedData}
          deals={payrollDeals}
          cars={cashPoolCars}
          repairItems={cashPoolRepairItems}
          expenses={expenses}
          manual={manualTransactions}
        />
      )}

      {/* 分支 7：公積金——進貨訂金（未來要付出去的錢）／客戶預訂訂金
          （未來會收進來的錢），見 vehicle-pipeline-module.tsx 開頭的說明。
          canRecord 交給伺服器端 action 再判斷一次（canEditCars ||
          canManageFinance），這裡進得來的人一定符合，因為分頁按鈕已經
          限定 hasFinanceAccess。canConfirmDeposit 才是真正把這個分頁
          跟「確認入帳」動作區分開來的權限——只有 hasFinanceAccess 能按。 */}
      {hasFinanceAccess && activeTab === "vehiclePipeline" && (
        <VehiclePipelineModule
          entries={vehiclePipelineEntries}
          financialAccounts={financialAccounts.filter((a) => a.is_active)}
          canRecord={
            !!cashPoolProfile &&
            (getEffectivePermissions(cashPoolProfile).canEditCars ||
              getEffectivePermissions(cashPoolProfile).canManageFinance)
          }
          canConfirmDeposit={hasFinanceAccess}
          onDataChanged={fetchSharedData}
        />
      )}
    </div>
  );
}
