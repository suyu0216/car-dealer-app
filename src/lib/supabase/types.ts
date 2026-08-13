// 共用型別，對應 supabase_schema.sql 的資料表結構。
// 若之後改用 `supabase gen types typescript`，可以直接取代這個檔案。

export type Role = "super_admin" | "tenant_admin" | "staff";

export type CarStatus = "preparing" | "in_stock" | "reserved" | "sold";

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
  status: TenantStatus;
  /** 是否已經完成過一次「車行品牌設定」引導，見 onboarding-wizard.tsx。 */
  onboarding_completed: boolean;
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
  detailing_cost: number | null;
  repair_cost: number | null;
  floor_price: number | null;
  selling_price: number | null;
  final_price: number | null;
  // 會計結帳快照：只有在 status === 'sold' 時才會有值，見
  // supabase_schema.sql 對這三欄的說明。非 null 代表這輛車已經結帳封存。
  closed_at: string | null;
  closed_prep_cost: number | null;
  closed_total_cost: number | null;
  // 進貨與付款追蹤
  paid_amount: number | null;
  payment_method: PaymentMethod | null;
  payment_note: string | null;
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
  // 其他
  status: CarStatus;
  image_url: string | null;
  created_at: string;
  /** 軟刪除時間戳記；非 null 代表這輛車已經被「刪除」（預設從庫存列表隱藏，
   * 但資料列本身、關聯的 repair_items/deals/car_photos 都還在，可以復原）。
   * 見 supabase_schema.sql 對這欄的說明。 */
  deleted_at: string | null;
}

export type PaymentMethod = "bank_transfer" | "debt_settlement" | "cash";
export type TransferStatus = "待辦" | "辦理中" | "已完成";

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

export interface Transaction {
  id: string;
  tenant_id: string;
  car_id: string | null;
  date: string;
  type: TransactionType;
  category: string;
  amount: number;
  note: string | null;
}

export type RepairItemStatus = "pending" | "approved" | "rejected";

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
  loan_status: string | null;
  salesperson_id: string | null;
  /** 這筆合約要撥給 salesperson_id 的預估佣金；只有車行管理員能填寫/修改。 */
  commission_amount: number | null;
  status: DealStatus;
  note: string | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
