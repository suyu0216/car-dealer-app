// 共用型別，對應 supabase_schema.sql 的資料表結構。
// 若之後改用 `supabase gen types typescript`，可以直接取代這個檔案。

export type Role = "super_admin" | "tenant_admin" | "staff";

export type CarStatus = "preparing" | "in_stock" | "reserved" | "sold";

// 車型分類——跟 supabase_schema.sql 的 cars_body_type_check constraint
// 保持一致，兩邊都要一起改。放在這個純型別檔案（不是 cars-actions.ts），
// 是因為 cars-actions.ts 開頭有 "use server"，Server Actions 檔案只能
// export async function，不能 export 一般的常數/型別，車輛表單（client
// component）跟前台展間頁都需要 import 這份清單，得放在沒有這個限制的
// 共用檔案裡。
export const VALID_BODY_TYPES = ["小型車", "房車", "休旅車", "跑車", "商用車"] as const;
export type BodyType = (typeof VALID_BODY_TYPES)[number];

export type TransactionType = "income" | "expense";

/** pending：剛註冊，後台可用但前台展間未對外開放／active：Super Admin
 * 已核准／suspended：被停權。見 supabase_schema.sql 對 tenants.status 的說明。 */
export type TenantStatus = "pending" | "active" | "suspended";

export interface Tenant {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  business_hours: string | null;
  /** 車行 Logo 網址（存 car-photos bucket，見 storage.ts 的 uploadTenantLogo()）。 */
  logo_url: string | null;
  /** LINE 官方帳號/個人 ID，前台展間可以顯示成聯絡方式。 */
  line_id: string | null;
  /** 理念與初衷：顧客前台展間顯示的品牌故事文字，選填。 */
  brand_story: string | null;
  /** 展間頁首圖橫幅（Hero）的自訂大圖網址，選填——不設定的話
   * showroom-page.tsx 會自動退回用「最新上架、有照片」的那台車當背景，
   * 見該檔案 heroCar 的說明。存 car-photos bucket，見 storage.ts 的
   * uploadTenantHeroImage()。 */
  hero_image_url: string | null;
  /** 社群媒體連結（Facebook／Instagram／抖音），選填，給前台展間頁 footer
   * 的「傳送門」圖示連結用。 */
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  /** 前台「服務項目」區塊文字，換行分隔一條一條服務，選填。 */
  services_text: string | null;
  /** 前台「品牌價值主張」區塊文字，換行分隔一條一條主張，選填。 */
  value_props_text: string | null;
  status: TenantStatus;
  /** 是否已經完成過一次「車行品牌設定」引導，見 onboarding-wizard.tsx。 */
  onboarding_completed: boolean;
  /** 資金總覽水池：起算點當下的現金／銀行餘額，跟 cash_pool_started_at
   * 一起使用，見 cash-pool-actions.ts 的說明。尚未設定過就是 null。 */
  cash_opening_balance: number | null;
  bank_opening_balance: number | null;
  /** 資金總覽水池的起算日期；只有這天（含）之後的成交收款／開銷／進貨
   * 付款／手動紀錄才會計入水池增減，避免舊資料把餘額算歪。 */
  cash_pool_started_at: string | null;
  /** 前台看車頁信任徽章：Google 商家整體星等（0-5，可小數，例如 4.8）。
   * 不是即時串接 Google API 抓的——Google Places API 的評論欄位快取限制
   * 很嚴、費用也不低，車行自己在「品牌設定」分頁手動填寫/更新即可，見
   * brand-settings-module.tsx。null 代表還沒填。 */
  google_rating: number | null;
  /** 前台看車頁信任徽章：Google 評論則數，同樣手動填寫。 */
  google_review_count: number | null;
  /** 前台看車頁信任徽章「查看更多評論」按鈕連結，通常是車行的 Google
   * 地圖評論頁網址，車行自己去 Google 商家後台複製。 */
  google_review_url: string | null;
  /** 「淨利／分潤試算」小工具（會計頁面分頁）是否啟用——給有股東/合夥人
   * 分潤需求的車行（例如分店）自己開，不需要的車行（例如單一車行沒有
   * 分潤安排）維持關閉，會計頁面就不會多出這個分頁造成困擾。管理員自己
   * 在「淨利／分潤試算」分頁裡開關，見 profit-share-module.tsx。 */
  profit_share_enabled: boolean;
  /** 分潤試算用的股權比例（0-100，可小數，例如 30 代表 30%）——系統拿
   * 這個比例乘上試算出的月淨利，算出「分潤金額」。null 代表管理員還沒
   * 填，這時分潤金額試算不出來，只會顯示淨利本身。 */
  profit_share_equity_percent: number | null;
  created_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string | null;
  role: Role;
  name: string | null;
  // 業務權限開關（RBAC）：只對 role === "staff" 有意義，tenant_admin /
  // super_admin 一律視為全部 true——不要直接讀這三欄做權限判斷，一律透過
  // src/lib/permissions.ts 的 getEffectivePermissions() 取得實際生效的權限。
  can_view_cost: boolean;
  can_view_salary: boolean;
  can_edit_cars: boolean;
  /** 公開展示用的個人電話，員工自己在「我的公開聯繫方式」分頁填寫，選填。 */
  public_phone: string | null;
  /** 公開展示用的個人 LINE ID，同上。 */
  public_line_id: string | null;
  /** 是否同意把上面兩欄公開顯示在顧客前台展間（/inventory）的「聯繫我們
   * 的業務」區塊——預設 false，員工自己勾選才會公開，不是填了就自動公開。 */
  show_public_contact: boolean;
  /** 公開展示用的個人簡介，同上一樣受 show_public_contact 控制。 */
  public_bio: string | null;
  /** 公開展示用的大頭照網址（car-photos bucket 公開網址），同上。 */
  public_avatar_url: string | null;
  created_at: string;
}

export interface Car {
  id: string;
  tenant_id: string;
  // 基本規格
  brand: string | null;
  model_name: string;
  year: number | null;
  license_year: number | null;
  mileage: number | null;
  engine_cc: number | null;
  transmission: string | null;
  color: string | null;
  license_plate: string | null;
  vin: string | null;
  registration_number: string | null;
  // 車況與認證
  certification: string | null;
  /** 逗號分隔的配備清單，例如 "電動座椅,倒車雷達,環景鏡頭"。 */
  equipment_tags: string | null;
  condition_notes: string | null;
  // 財務與成本結構
  purchase_price: number;
  transfer_fee: number | null;
  /** 這台車的稅金／發票稅金——不同車型、公司車/一般車稅率都不同，沒辦法
   * 用固定百分比自動算，車行自己填實際金額，見 car-form-modal.tsx。 */
  tax_amount: number | null;
  detailing_cost: number | null;
  repair_cost: number | null;
  floor_price: number | null;
  selling_price: number | null;
  final_price: number | null;
  // 會計結帳快照：只有在 status === 'sold' 時才會有值，見
  // supabase_schema.sql 對這三欄的說明。非 null 代表這輛車已經結帳封存。
  closed_at: string | null;
  closed_prep_cost: number | null;
  /** 結帳當下對應合約的業務抽成（封存快照）；已經計入 closed_total_cost，
   * 這裡單獨留一欄是為了在車輛詳情頁把「業務抽成」跟其他成本分開顯示。
   * NULL＝尚未結帳，或結帳當下沒有對應的抽成。 */
  closed_commission_cost: number | null;
  closed_total_cost: number | null;
  // 進貨與付款追蹤
  paid_amount: number | null;
  payment_method: PaymentMethod | null;
  payment_note: string | null;
  /** 採購業務：這輛車是哪位同仁負責收購進來的，跟 created_by（誰在系統
   * 裡輸入這筆資料）、deals.salesperson_id（誰賣給客戶）是三件不同的事。
   * 存的是 profiles.id，畫面上要對照 staff 清單才能顯示名字。 */
  purchased_by: string | null;
  // 行政過戶與第三方認證
  transfer_date: string | null;
  transfer_status: TransferStatus | null;
  inspection_agency: string | null;
  inspection_date: string | null;
  inspection_status: string | null;
  // 二胎／人頭車合作紀錄：has_used_as_nominee 是永久旗標，一旦 true 就
  // 不會再被改回 false，見 supabase_schema.sql 跟 cars-actions.ts 的說明。
  nominee_company: string | null;
  nominee_days: string | null;
  nominee_start_date: string | null;
  id_return_date: string | null;
  has_used_as_nominee: boolean;
  // 前台展示開關：/inventory 公開看車頁只會撈 is_public = true 的車輛。
  is_public: boolean;
  // 車型分類（小型車/房車/休旅車/跑車/商用車）——給前台展間頁上方的分類
  // 選單用，可為 null（未分類/新上架還沒選）。「熱門推薦」是後台手動
  // 開關，不是系統自動判斷，跟這個系統一貫「不寫憑空捏造的熱門/搶購
  // 假訊息」的原則一致（見 public-cars.ts 對「近期上架」標籤的說明）。
  body_type: string | null;
  is_featured: boolean;
  // 其他
  status: CarStatus;
  image_url: string | null;
  created_at: string;
  /** 上架人：這輛車是哪位同仁在系統裡新增的（見 cars-actions.ts 的
   * createCar()），只在新增當下寫入一次，之後編輯車輛不會改變。存的是
   * profiles.id，畫面上要對照 staff 清單才能顯示名字——這個人如果後來
   * 被移出車行/刪除帳號，這裡會變成 null（見 supabase_schema.sql 的
   * on delete set null），車輛本身不受影響。 */
  created_by: string | null;
  /** 軟刪除時間戳記；非 null 代表這輛車已經被「刪除」（預設從庫存列表隱藏，
   * 但資料列本身、關聯的 repair_items/deals/car_photos 都還在，可以復原）。
   * 見 supabase_schema.sql 對這欄的說明。 */
  deleted_at: string | null;
}

export type PaymentMethod = "bank_transfer" | "debt_settlement" | "cash";
export type TransferStatus = "待辦" | "辦理中" | "已完成";

/** 資金總覽水池只分兩池：cash=現金 / bank=銀行（含匯款、信用卡——信用卡
 * 帳單最終還是從銀行帳戶扣款，歸類進銀行池）。跟 cars.payment_method
 * （bank_transfer/debt_settlement/cash）、company_expenses.payment_method
 * （匯款/現金/信用卡）是各自欄位原本就有的、更細的付款方式，水池計算時
 * 會把那些值換算成這兩池之一，見 cash-pool.ts 的 toPoolMethod()。 */
export type CashPoolMethod = "cash" | "bank";

/** 車輛細節相簿；主圖仍是 Car.image_url，這裡放額外的細節照片。
 * 目前系統還沒有相簿瀏覽 UI，這個型別先備著給匯入腳本/未來功能用。 */
export interface CarPhoto {
  id: string;
  tenant_id: string;
  car_id: string;
  url: string;
  sort_order: number;
  created_at: string;
}

/** 手動記帳的其他現金異動（不屬於成交收款／公司開銷／進貨付款的部分，
 * 例如老闆存入、老闆提領、銀行利息、轉帳手續費），給「資金總覽」水池
 * 補資料用，見 cash-pool-actions.ts。這張表本來就存在但一直沒被用到。 */
export interface Transaction {
  id: string;
  tenant_id: string;
  car_id: string | null;
  date: string;
  type: TransactionType;
  category: string;
  amount: number;
  payment_method: CashPoolMethod | null;
  note: string | null;
}

export type RepairItemStatus = "pending" | "approved" | "rejected";

/** 請款類別——取代車輛表單原本手動填、沒人真的在同步的「整理美容成本」
 * 欄位。'維修' 對應原本的「整備維修成本」，'美容' 對應「整理美容成本」，
 * '其他' 是不屬於這兩類的雜項開銷（例如代辦規費）。見
 * car-detail-modal.tsx 依類別分開加總顯示的邏輯。 */
export type RepairItemCategory = "維修" | "美容" | "其他";

export interface RepairItem {
  id: string;
  tenant_id: string;
  car_id: string;
  item_name: string;
  vendor_name: string | null;
  handler_name: string | null;
  amount: number;
  receipt_number: string | null;
  status: RepairItemStatus;
  category: RepairItemCategory;
  /** 舊版「貼網址」欄位，向下相容用；新資料一律用 evidence_path。 */
  evidence_url: string | null;
  /** Supabase Storage repair-evidences bucket 裡的物件路徑（私有 bucket，
   * 顯示時要另外向伺服器要 signed URL，不能直接當 <a href> 用）。 */
  evidence_path: string | null;
  note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type CustomerFollowUpStatus =
  | "new"
  | "test_drive_followup"
  | "deposit_received"
  | "delivery_care";

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  interested_model: string | null;
  budget_min: number | null;
  budget_max: number | null;
  follow_up_status: CustomerFollowUpStatus;
  line_id: string | null;
  note: string | null;
  created_at: string;
}

export type DealStatus = "draft" | "signed" | "delivered";

export interface Deal {
  id: string;
  tenant_id: string;
  car_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  final_price: number;
  deposit_amount: number | null;
  balance_amount: number | null;
  /** 訂金＋尾款合計的收款方式：cash=現金 / bank=匯款，NULL=尚未記錄。
   * 給資金總覽水池分類這筆收款要算進現金還是銀行。 */
  payment_method: CashPoolMethod | null;
  loan_status: string | null;
  salesperson_id: string | null;
  /** 這筆合約要撥給 salesperson_id 的預估佣金；只有車行管理員能填寫/修改。 */
  commission_amount: number | null;
  status: DealStatus;
  note: string | null;
  created_at: string;
}

/** 公司營運開銷（水電/租金/廣告等跟特定車輛無關的固定支出），見
 * supabase_schema.sql 的 company_expenses 表跟
 * src/app/dashboard/company-expenses-actions.ts。跟車輛「成本與底價」
 * 一樣屬於敏感財務資訊，只有 canViewCost 的人看得到／填得到。 */
export interface CompanyExpense {
  id: string;
  tenant_id: string;
  expense_date: string;
  category: string;
  title: string;
  amount: number;
  payment_method: string | null;
  payer_name: string | null;
  invoice_number: string | null;
  /** 這筆開銷（主要是「人事薪資」類別）是發給哪位員工的，給「薪資單」
   * 頁面（payroll-module.tsx）自動加總這個人的底薪用；其餘類別留 null。
   * 存的是 profiles.id。 */
  employee_profile_id: string | null;
  note: string | null;
  created_at: string;
}

/** 後台鈴鐺通知類型，見 supabase_schema.sql 的 notifications 表跟
 * src/lib/supabase/notifications.ts 的 createNotification()。 */
export type NotificationType =
  | "repair_item_pending"
  | "company_expense_created"
  | "trade_in_request_created";

export interface Notification {
  id: string;
  tenant_id: string;
  type: NotificationType;
  title: string;
  message: string;
  actor_name: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

/** 處理狀態——new：剛送出還沒人處理／contacted：業務已聯繫／
 * closed：已結案（不論成交與否）。跟 CustomerFollowUpStatus 是不同的兩件
 * 事，這裡只追蹤「這張估價單有沒有被業務處理」。 */
export type TradeInRequestStatus = "new" | "contacted" | "closed";

/** 車行「影音專區」——貼在抖音/YouTube等平台發布的影片連結，見
 * supabase_schema.sql 的 tenant_videos 表跟 video-actions.ts。 */
export interface TenantVideo {
  id: string;
  tenant_id: string;
  title: string | null;
  video_url: string;
  sort_order: number;
  created_at: string;
}

/** 車行自己手動挑選、貼上的 Google 評論精選小卡（顧客真實評論的原文
 * 轉貼），顯示在前台看車頁（/inventory）的「顧客怎麼說」區塊——不是即時
 * 串接 Google API 抓的，見 tenants.google_rating 的說明跟
 * tenant-reviews-module.tsx。 */
export interface TenantReview {
  id: string;
  tenant_id: string;
  author_name: string;
  rating: number;
  review_text: string;
  /** 見證照（Google 評論截圖或客人合照），選填，見
   * storage.ts 的 uploadTenantReviewPhoto()。null 代表沒有配圖。 */
  photo_url: string | null;
  sort_order: number;
  created_at: string;
}

/** 品牌簡介首頁首圖橫幅相簿——車行自己隨時可以上傳/刪除，前台顯示成
 * 左右翻頁的相簿（不只單張圖），見 storage.ts 的 uploadTenantHeroPhoto()、
 * tenant-hero-photos-module.tsx（後台管理 UI）跟 showroom-home-section.tsx
 * （前台顯示）。結構完全比照 TenantReview／tenant_reviews 表（同樣是
 * 「車行自己管理的一組排序好的項目清單」），只是欄位更精簡：沒有評論
 * 文字/星等，只有圖片網址跟排序。車行還沒上傳任何一張的話，前台會自動
 * 退回舊的單張 tenant.hero_image_url／第一台有照片的車，見
 * showroom-home-section.tsx 的說明。 */
export interface TenantHeroPhoto {
  id: string;
  tenant_id: string;
  url: string;
  sort_order: number;
  created_at: string;
}

/** 公開展間「我要估車」表單送出的估價需求單，見 supabase_schema.sql 的
 * trade_in_requests 表。 */
export interface TradeInRequest {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  line_id: string | null;
  brand: string | null;
  model_name: string | null;
  year: number | null;
  mileage: number | null;
  note: string | null;
  status: TradeInRequestStatus;
  created_at: string;
}

// @supabase/postgrest-js 的 select-string 型別解析器要求每張表都帶
// `Relationships`，Schema 要帶 `Tables` / `Views` / `Functions`，
// 缺任何一項都會讓它推導失敗、悄悄 fallback 成 `never`。這裡沒有定義
// 外鍵關聯查詢（都用兩次查詢在應用層 join），所以 Relationships 給空陣列即可。
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      tenants: Table<Tenant>;
      profiles: Table<Profile>;
      cars: Table<Car>;
      transactions: Table<Transaction>;
      repair_items: Table<RepairItem>;
      customers: Table<Customer>;
      deals: Table<Deal>;
      car_photos: Table<CarPhoto>;
      company_expenses: Table<CompanyExpense>;
      notifications: Table<Notification>;
      trade_in_requests: Table<TradeInRequest>;
      tenant_videos: Table<TenantVideo>;
      tenant_reviews: Table<TenantReview>;
      tenant_hero_photos: Table<TenantHeroPhoto>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
