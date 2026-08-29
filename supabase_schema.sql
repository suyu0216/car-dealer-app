-- =============================================================================
-- 中古車商多租戶 (Multi-Tenant) 進銷存記帳系統 — Supabase Schema
-- =============================================================================
-- 執行方式：在 Supabase Dashboard -> SQL Editor 貼上並執行，
-- 或使用 `supabase db push` / psql 匯入。
-- =============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- 1. tenants（車行租戶）
-- -----------------------------------------------------------------------------
create table if not exists public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

comment on table public.tenants is '中古車商租戶（車行）';

-- 車行基本資訊（電話、地址、營業時間）。用 alter ... add column if not exists
-- 而不是改 create table，因為 create table if not exists 對已經存在的表
-- 不會做任何事 —— 這是唯一能讓「已經跑過一次的舊專案」也吃到新欄位的寫法。
alter table public.tenants add column if not exists phone           text;
alter table public.tenants add column if not exists address         text;
alter table public.tenants add column if not exists business_hours  text;

-- 品牌設定：Logo（存 car-photos bucket，路徑 "<tenant_id>/branding/..."，
-- 沿用已經做好租戶隔離的 storage policy，不用另開新 bucket）跟 LINE 官方
-- 帳號/個人 ID，給前台展間顯示、也給顧客用 LINE 聯絡。
alter table public.tenants add column if not exists logo_url text;
alter table public.tenants add column if not exists line_id text;

-- SaaS 平台化：Onboarding 引導 + Super Admin 審核開通。
--
-- status：pending（剛註冊，後台可用但前台展間未對外開放）／
-- active（Super Admin 已核准，展間正常公開）／suspended（被停權，後台
-- 頁面會擋下來改顯示停權通知，見 src/app/dashboard/page.tsx）。
--
-- 注意：suspended 目前是「應用層（dashboard/page.tsx）」擋下來，不是靠
-- RLS 擋——car/deals/customers 等資料表的 RLS 仍然只看 tenant_id 是否
-- 相符，沒有另外檢查 tenants.status。也就是說被停權的車行如果繞過
-- Next.js 前端、直接拿舊的登入 session 打 Supabase REST API，理論上還是
-- 讀寫得到自己的資料——跟公開展間（有真正的 RLS 擋）不是同一個防護等級。
-- 之後如果要把停權做成資料庫層也擋死，要另外把 tenants.status = 'active'
-- 這個條件疊加進每一張 tenant_scoped policy，這裡先只處理「日常使用會
-- 走的畫面」，作為之後要加強時的已知範圍。
--
-- onboarding_completed：是否已經完成過一次「車行品牌設定」引導（見
-- src/app/dashboard/_components/onboarding-wizard.tsx）。跟 status 是
-- 兩件獨立的事——pending 的車行一樣可以先把 Onboarding 填完，不用等
-- Super Admin 核准才能設定資料；status 只決定「前台看不看得到」。
--
-- 這兩欄都用「先判斷欄位存不存在，不存在才新增 + backfill」的寫法，
-- 不能只靠 column default 就打發：如果只設 default，這份 schema.sql
-- 檔案本身設計成可以整份安全重跑（見檔案開頭的說明），未來只要重新執行
-- 一次，所有「已經是 pending 的真實新車商」都會被 backfill 的 UPDATE
-- 誤判成 active/onboarding_completed——backfill 只能在「這個欄位是這次
-- 才第一次出現」的情況下跑一次，之後這份檔案再怎麼重跑都不能再誤觸。
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenants' and column_name = 'status'
  ) then
    alter table public.tenants add column status text not null default 'pending';
    -- 這次 migration 之前就已經存在的車行，一律視為早就核准過，
    -- 避免既有車行的展間因為這次改動突然被下架。
    update public.tenants set status = 'active';
  end if;
end $$;

alter table public.tenants add column if not exists status text not null default 'pending';
alter table public.tenants drop constraint if exists tenants_status_check;
alter table public.tenants add constraint tenants_status_check
  check (status in ('pending', 'active', 'suspended'));

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenants' and column_name = 'onboarding_completed'
  ) then
    alter table public.tenants add column onboarding_completed boolean not null default false;
    -- 同上，既有車行視為已經完成過 Onboarding，不會突然被導去引導畫面。
    update public.tenants set onboarding_completed = true;
  end if;
end $$;

alter table public.tenants add column if not exists onboarding_completed boolean not null default false;

-- -----------------------------------------------------------------------------
-- 2. profiles（使用者資料，1:1 對應 auth.users）
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  tenant_id  uuid references public.tenants (id) on delete set null,
  role       text not null default 'staff'
             check (role in ('super_admin', 'tenant_admin', 'staff')),
  name       text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is '使用者角色與所屬車行；role: super_admin(平台管理員) / tenant_admin(車行管理員) / staff(一般員工)';

-- super_admin 不隸屬任何車行，tenant_admin / staff 必須有 tenant_id 才能存取業務資料。
create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);

-- 角色權限管理（RBAC）／業務權限開關：三個個別權限開關，只對 role = 'staff'
-- 有意義——tenant_admin（車行管理員）不管這三欄存什麼值，一律視為全部
-- true（見 src/lib/permissions.ts 的 getEffectivePermissions()，前端/
-- Server Action 一律透過那支函式取得「實際生效」的權限，不要直接讀這三欄）。
-- 預設值的考量：can_view_cost 預設 false（成本/底價是敏感財務資訊，預設
-- 不給一般業務看，管理員要手動開）；can_view_salary / can_edit_cars 預設
-- true（一般業務照舊看得到自己的業績、也能維護車輛資料，符合現有的使用
-- 習慣，管理員如果要收回權限再手動關）。
alter table public.profiles add column if not exists can_view_cost   boolean not null default false;
alter table public.profiles add column if not exists can_view_salary boolean not null default true;
alter table public.profiles add column if not exists can_edit_cars   boolean not null default true;

-- -----------------------------------------------------------------------------
-- 3. cars（車輛 / 進銷存主體）
-- -----------------------------------------------------------------------------
create table if not exists public.cars (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  model          text not null,
  status         text not null default 'in_stock'
                 check (status in ('in_stock', 'reserved', 'sold')),
  purchase_price numeric(12, 2) not null default 0,
  selling_price  numeric(12, 2),
  created_at     timestamptz not null default now()
);

comment on table public.cars is '車輛庫存；status: preparing(整備中) / in_stock(待售中) / reserved(已保留) / sold(已售出)';

-- 廠牌、年份、里程。
alter table public.cars add column if not exists brand   text;
alter table public.cars add column if not exists year    integer;
alter table public.cars add column if not exists mileage integer;

-- model_name 是現在的主要車型欄位；舊的 model 欄位保留下來當作向下相容
-- 欄位（不刪除，只解除 NOT NULL），前端每次新增/更新車輛都會自動把
-- `${brand} ${model_name}` 寫回 model（見 src/app/dashboard/cars-actions.ts
-- 的 parseCarForm()），所以還在讀 model 欄位的舊資料/舊查詢不會看到空值。
-- 下面這段不管目前的狀態是「還沒有 model_name」「model 還是 NOT NULL」
-- 還是「兩個都已經處理好了」，都會收斂到同一個最終狀態，可以安全重複執行。
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cars'
      and column_name = 'model' and is_nullable = 'NO'
  ) then
    alter table public.cars add column if not exists model_name text;
    update public.cars set model_name = model where model_name is null;
    alter table public.cars alter column model drop not null;
  end if;
end $$;

alter table public.cars add column if not exists model         text;
alter table public.cars add column if not exists model_name    text;
alter table public.cars add column if not exists license_plate text;
alter table public.cars add column if not exists color         text;
alter table public.cars add column if not exists floor_price   numeric(12, 2);

-- 車輛履歷／全方位營運功能擴充：規格、認證、成本拆解、主圖。
-- 基本規格
alter table public.cars add column if not exists license_year     integer;       -- 領牌年份
alter table public.cars add column if not exists engine_cc        integer;       -- 排氣量 (cc)
alter table public.cars add column if not exists transmission     text;          -- 傳動/變速箱
alter table public.cars add column if not exists vin               text;          -- 車身號碼 (VIN)
alter table public.cars add column if not exists registration_number text;       -- 進口/行照號碼

-- 車況與認證
alter table public.cars add column if not exists certification    text;          -- 認證狀態（GOO / 第三方認證 / 未認證…）
alter table public.cars add column if not exists equipment_tags   text;          -- 出廠配備清單，逗號分隔，前端解析成 tags
alter table public.cars add column if not exists condition_notes  text;          -- 車況備註與整理重點

-- 財務與成本結構（purchase_price=收購進價、selling_price=展示開價、
-- floor_price=預計底價，三個原本就有；這裡補上其餘成本項目）
alter table public.cars add column if not exists transfer_fee     numeric(12, 2); -- 過戶費/規費
alter table public.cars add column if not exists detailing_cost   numeric(12, 2); -- 整理美容成本
alter table public.cars add column if not exists repair_cost      numeric(12, 2); -- 整備維修成本
alter table public.cars add column if not exists final_price      numeric(12, 2); -- 最終成交價

-- 展示用主圖（先用網址欄位，不經 Supabase Storage）
alter table public.cars add column if not exists image_url        text;

-- 會計結帳快照：車輛狀態一旦變成 sold（已售出），src/app/dashboard/
-- cars-actions.ts 會把「當下」已核准的維修整備費加總、連同收購價／規費
-- 一起封存進這三個欄位，之後就算又有新的維修請款被核准，也不會再回頭
-- 更動這輛車的已結帳數字 —— 這是「已實現損益」該有的性質：結過帳的
-- 數字不能因為之後發生的事情跑掉。狀態如果又從 sold 改回其他狀態
-- （例如登記錯誤要更正），這三欄會被清空，回到用即時計算的「在庫車輛」邏輯；
-- 之後如果再次變回 sold，會用當下最新的資料重新封存一次。
alter table public.cars add column if not exists closed_at         timestamptz;    -- 結帳（售出）時間
alter table public.cars add column if not exists closed_prep_cost  numeric(12, 2); -- 結帳當下的已核准維修整備費加總（封存）
alter table public.cars add column if not exists closed_total_cost numeric(12, 2); -- 結帳當下的車輛總成本 = 收購價 + closed_prep_cost + 規費（封存）

-- =============================================================================
-- 中古車行營運系統增量擴充：進貨付款追蹤／行政過戶與第三方認證／
-- 二胎與人頭車合作紀錄／前台展示開關
-- =============================================================================
-- 全部欄位一律可為 NULL、沒有預設值會改變既有資料（is_public /
-- has_used_as_nominee 這兩個布林例外，理由見各自欄位的註解），純增量、
-- 不影響任何既有欄位或既有資料列。purchase_price（收購總金額）本來就
-- 已經存在（上面「財務與成本結構」那段），這裡不重複新增。

-- 進貨與付款追蹤
alter table public.cars add column if not exists paid_amount   numeric(12, 2); -- 已付金額
alter table public.cars add column if not exists payment_method text;         -- 付款方式
alter table public.cars add column if not exists payment_note   text;         -- 付款備註

alter table public.cars drop constraint if exists cars_payment_method_check;
alter table public.cars add constraint cars_payment_method_check
  check (payment_method is null or payment_method in ('bank_transfer', 'debt_settlement', 'cash'));

-- 行政過戶與第三方認證
alter table public.cars add column if not exists transfer_date     date; -- 預定過戶日期
alter table public.cars add column if not exists transfer_status   text; -- 過戶狀態：待辦/辦理中/已完成
alter table public.cars add column if not exists inspection_agency text; -- 認證機構，如 GOO/SAVE 等
alter table public.cars add column if not exists inspection_date   date; -- 預約認證日期
alter table public.cars add column if not exists inspection_status text; -- 認證狀態/結果

alter table public.cars drop constraint if exists cars_transfer_status_check;
alter table public.cars add constraint cars_transfer_status_check
  check (transfer_status is null or transfer_status in ('待辦', '辦理中', '已完成'));

-- 二胎／人頭車合作紀錄
-- has_used_as_nominee 是「這輛車有沒有登記過人頭」的永久旗標，一旦變成
-- true 就不會再被改回 false（見 src/app/dashboard/cars-actions.ts 的
-- 防呆邏輯：只要現有資料列的這個旗標是 true，後續任何更新一律忽略表單
-- 送上來的二胎/人頭欄位，不會被覆蓋，也不允許重新登記）。
alter table public.cars add column if not exists nominee_company      text;                            -- 二胎公司名稱
alter table public.cars add column if not exists nominee_days         text;                            -- 人頭天數（純紀錄文字/數字，不強制格式）
alter table public.cars add column if not exists nominee_start_date   date;                             -- 人頭開始日期
alter table public.cars add column if not exists id_return_date       date;                             -- 證件預計/實際回收日期
alter table public.cars add column if not exists has_used_as_nominee  boolean not null default false;   -- 已使用過人頭（永久旗標，見上方說明）

-- 前台展示開關：/inventory 公開看車頁只會撈 is_public = true 的車輛，
-- 預設 true（既有車輛沿用現況，全部視為可公開展示，車行可以再自行關閉
-- 個別車輛不上架）。
alter table public.cars add column if not exists is_public boolean not null default true;

-- status 從 3 態擴充成 4 態：preparing(整備中，剛收購還沒上架) /
-- in_stock(待售中) / reserved(已保留) / sold(已售出)。
-- CHECK constraint 不能直接改內容，只能刪掉重建；cars_status_check 是
-- 建表時 Postgres 對這個欄位 check 子句自動產生的預設名稱。
alter table public.cars drop constraint if exists cars_status_check;
alter table public.cars add constraint cars_status_check
  check (status in ('preparing', 'in_stock', 'reserved', 'sold'));

-- 軟刪除：deleted_at 非 null 代表這輛車已經被「刪除」。刻意不用真的
-- DELETE FROM cars —— cars 被 repair_items / deals 用 on delete cascade
-- 參照，真的刪列會連帶把這輛車的維修請款紀錄、買賣合約通通刪掉，車行的
-- 歷史財務/合約紀錄不該因為「不想再顯示這輛車」而消失。前端預設隱藏
-- deleted_at 非 null 的車輛（見 cars-manager.tsx），但保留「復原」的路徑
-- （UPDATE deleted_at = null），資料本身、跟它關聯的 repair_items/deals/
-- car_photos 全部完整保留、不受影響。
alter table public.cars add column if not exists deleted_at timestamptz;
create index if not exists cars_deleted_at_idx on public.cars (deleted_at) where deleted_at is not null;

create index if not exists cars_tenant_id_idx on public.cars (tenant_id);

-- -----------------------------------------------------------------------------
-- car_photos（車輛相簿：一輛車可以有多張細節照片）
-- -----------------------------------------------------------------------------
-- cars.image_url 還是「主圖」（所有畫面目前都只認這一欄），car_photos 是
-- 額外的細節照片相簿——目前系統還沒有相簿瀏覽 UI，這張表先把資料存好，
-- 之後要補相簿介面時不用再動資料庫。
create table if not exists public.car_photos (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  car_id     uuid not null references public.cars (id) on delete cascade,
  url        text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.car_photos is '車輛細節相簿（主圖仍是 cars.image_url，這張表放額外的細節照片）';

create index if not exists car_photos_car_id_idx on public.car_photos (car_id);
create index if not exists car_photos_tenant_id_idx on public.car_photos (tenant_id);

grant select, insert, update, delete on public.car_photos to authenticated;
grant select on public.car_photos to anon;

alter table public.car_photos enable row level security;

drop policy if exists "car_photos_super_admin_all" on public.car_photos;
create policy "car_photos_super_admin_all"
  on public.car_photos for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "car_photos_tenant_scoped" on public.car_photos;
create policy "car_photos_tenant_scoped"
  on public.car_photos for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- 跟 cars_public_showroom_read 同一個道理：/inventory 之後補相簿 UI 時，
-- 未登入訪客也要看得到「已公開上架車輛」的細節照片。用子查詢確認這張
-- 照片所屬的車輛是公開且未售出的，不能靠 car_photos 自己的欄位判斷
-- （這張表本身沒有 is_public/status）。
-- 同上，車輛所屬的車行也要是 status = 'active' 才給看相簿照片。
drop policy if exists "car_photos_public_showroom_read" on public.car_photos;
create policy "car_photos_public_showroom_read"
  on public.car_photos for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.cars
      join public.tenants t on t.id = cars.tenant_id
      where cars.id = car_photos.car_id
        and cars.is_public = true
        and cars.status <> 'sold'
        and cars.deleted_at is null
        and t.status = 'active'
    )
  );

-- -----------------------------------------------------------------------------
-- 4. transactions（收支記帳）
-- -----------------------------------------------------------------------------
create table if not exists public.transactions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  car_id     uuid references public.cars (id) on delete set null,
  date       date not null default current_date,
  type       text not null check (type in ('income', 'expense')),
  category   text not null,
  amount     numeric(12, 2) not null check (amount >= 0),
  note       text
);

comment on table public.transactions is '收支紀錄；type: income(收入) / expense(支出)';

create index if not exists transactions_tenant_id_idx on public.transactions (tenant_id);
create index if not exists transactions_car_id_idx on public.transactions (car_id);

-- -----------------------------------------------------------------------------
-- 5. repair_items（車輛維修請款明細 —— 維修請款與會計審核模組）
-- -----------------------------------------------------------------------------
-- 業務對單一車輛送出多筆維修/保養請款項目，狀態預設 pending（待會計審核）；
-- 車行管理員（扮演會計角色，見 src/app/dashboard/repair-items-actions.ts
-- 的 reviewRepairItem() 權限檢查）核准後狀態變成 approved（會計已撥款），
-- 前端會即時把所有 approved 項目加總成該車的「維修整備總成本」，不需要
-- 額外的 trigger 同步一份快取欄位到 cars 表 —— 加總永遠是即時算出來的，
-- 不會有兩邊資料兜不起來的風險。
create table if not exists public.repair_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  car_id         uuid not null references public.cars (id) on delete cascade,
  item_name      text not null,                          -- 維修項目名稱（烤漆、換機油…）
  vendor_name    text,                                    -- 廠商/保養廠名稱
  handler_name   text,                                    -- 墊款業務/經手人
  amount         numeric(12, 2) not null check (amount >= 0),
  receipt_number text,                                    -- 單據號碼/發票號
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  evidence_url   text,                                    -- 憑證照片網址
  note           text,                                    -- 退回原因等備註
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

comment on table public.repair_items is '車輛維修請款明細；status: pending(待會計審核) / approved(會計已撥款) / rejected(已退回)';

-- evidence_url 是舊版「貼網址」欄位，保留只為向下相容；新版一律走檔案
-- 上傳（Supabase Storage 的 repair-receipts bucket，私有），存的是物件
-- 路徑（object path）不是網址，要顯示時由伺服器端即時簽發短效期的
-- signed URL（見 src/app/dashboard/page.tsx），所以另外開一個欄位存路徑，
-- 不會跟舊的 evidence_url 混在一起。
alter table public.repair_items add column if not exists evidence_path text;

create index if not exists repair_items_tenant_id_idx on public.repair_items (tenant_id);
create index if not exists repair_items_car_id_idx on public.repair_items (car_id);

-- -----------------------------------------------------------------------------
-- 6. customers（CRM 客戶與賞車追蹤）
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  name               text not null,
  phone              text,
  interested_model   text,                    -- 感興趣車款
  budget_min         numeric(12, 2),
  budget_max         numeric(12, 2),
  follow_up_status   text not null default 'new'
                     check (follow_up_status in ('new', 'test_drive_followup', 'deposit_received', 'delivery_care')),
  line_id            text,                    -- LINE 綁定欄位（先存 LINE ID，之後要接 LINE Notify/Messaging API 可以延伸）
  note               text,
  created_at         timestamptz not null default now()
);

comment on table public.customers is 'CRM 賞車客戶；follow_up_status: new(新名單) / test_drive_followup(試駕後回訪) / deposit_received(訂金已收) / delivery_care(交車關懷)';

create index if not exists customers_tenant_id_idx on public.customers (tenant_id);

-- -----------------------------------------------------------------------------
-- 7. deals（買賣合約與交易）
-- -----------------------------------------------------------------------------
create table if not exists public.deals (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  car_id           uuid not null references public.cars (id) on delete cascade,
  customer_id      uuid references public.customers (id) on delete set null,
  -- 客戶姓名/電話這裡刻意再存一份文字快照（不強制一定要先建 CRM 客戶資料才能
  -- 簽約），選了現有客戶時前端會自動帶入，之後就算那筆 CRM 資料被改名，
  -- 合約上留存的名字還是簽約當下那個，比較符合法律文件「當下狀態」的性質。
  customer_name    text not null,
  customer_phone   text,
  final_price      numeric(12, 2) not null,   -- 成交價
  deposit_amount   numeric(12, 2),            -- 訂金
  balance_amount   numeric(12, 2),            -- 尾款
  loan_status      text,                      -- 貸款進度（自由文字：無貸款／審核中／已核貸…）
  salesperson_id   uuid references public.profiles (id) on delete set null, -- 承辦業務，用於銷售排行榜
  status           text not null default 'draft'
                   check (status in ('draft', 'signed', 'delivered')),
  note             text,
  created_at       timestamptz not null default now()
);

comment on table public.deals is '買賣合約與交易；status: draft(草約) / signed(已簽約) / delivered(已交車)';

-- 業務抽成：這筆合約要撥給 salesperson_id 的預估佣金，由車行管理員在合約
-- 表單上填寫（一般業務不開放自己填，避免球員兼裁判）。「業務薪資」模組
-- 會依 salesperson_id 把這欄加總成每個人的業績/抽成明細。
alter table public.deals add column if not exists commission_amount numeric(12, 2);

create index if not exists deals_tenant_id_idx on public.deals (tenant_id);
create index if not exists deals_car_id_idx on public.deals (car_id);
create index if not exists deals_customer_id_idx on public.deals (customer_id);

-- =============================================================================
-- Grants（資料表層級授權 —— 跟 RLS 是兩件不同的事）
-- =============================================================================
-- 常見誤解：以為「有 RLS policy 就夠了」。實際上 Postgres 有兩層檢查：
--   1. GRANT：這個角色「能不能碰這張表」，這一層先過，Postgres 才會往下
--      評估 RLS policy。
--   2. RLS policy：能碰到表之後，「能看到/改到哪幾列」。
-- 透過 Supabase Dashboard 的 Table Editor 建表，Supabase 會自動幫你補上
-- 這一層 grant；但直接在 SQL Editor 手動 `create table` 時，如果專案的
-- default privileges 沒有涵蓋到當時執行 SQL 的角色，新建的表就可能完全
-- 沒有授權給 authenticated / anon —— 這時候查詢會直接收到
-- `permission denied for table ...`（Postgres 錯誤碼 42501），而且這個
-- 錯誤發生在 RLS 檢查「之前」，跟 RLS policy 寫得對不對完全無關，也跟
-- cookie／session 有沒有正確傳遞無關。GRANT 不是「每列」授權，是整張表
-- 授權，重複執行也是安全的（沒有的話會補上，已經有的話沒有作用）。
-- =============================================================================

grant usage on schema public to authenticated;
grant usage on schema public to anon;

grant select, insert, update, delete on public.tenants to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.cars to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.repair_items to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.deals to authenticated;

-- /inventory 公開看車頁需要的匿名（anon）唯讀權限：只給 SELECT，且只給
-- 這兩張表——其餘表（profiles/repair_items/customers/deals/transactions）
-- 完全不授權給 anon，就算 RLS 設錯，anon 角色也連「碰」都碰不到那些表
-- （GRANT 這一層先擋下來，見上面「permission denied for table ...」的說明）。
grant select on public.tenants to anon;
grant select on public.cars to anon;

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- 重要：不可直接在 profiles 的 RLS policy 內對 profiles 下 SELECT 子查詢，
-- 那會造成無窮遞迴 (infinite recursion)。改用 SECURITY DEFINER 函式讀取
-- 目前使用者的 role / tenant_id，繞過呼叫端自身的 RLS 檢查。
-- =============================================================================

create or replace function public.current_role_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_role_name() = 'super_admin';
$$;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.cars enable row level security;
alter table public.transactions enable row level security;
alter table public.repair_items enable row level security;
alter table public.customers enable row level security;
alter table public.deals enable row level security;

-- -----------------------------------------------------------------------------
-- tenants policies
-- -----------------------------------------------------------------------------
-- 注意：每個 create policy 前面都先 drop policy if exists，讓這份 schema
-- 檔案永遠可以安全地整份重新執行（無論是第一次建置，或之後任何一次改動），
-- 不會因為「policy already exists」半途噴錯、卡在某個舊版本的中間狀態。

-- super_admin：完全讀寫所有車行。
drop policy if exists "tenants_super_admin_all" on public.tenants;
create policy "tenants_super_admin_all"
  on public.tenants for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- 一般用戶：只能讀取自己所屬的車行資料（顯示車行名稱用）。
drop policy if exists "tenants_select_own" on public.tenants;
create policy "tenants_select_own"
  on public.tenants for select
  using (id = public.current_tenant_id());

-- 車行管理員（tenant_admin）：可以更新自己車行的品牌資料（名稱/電話/
-- 地址/營業時間/Logo/LINE）。一般業務（staff）不行——with check 同時擋住
-- 「改到別間車行」跟「非管理員也能改」這兩種情況。
drop policy if exists "tenants_admin_update" on public.tenants;
create policy "tenants_admin_update"
  on public.tenants for update
  using (id = public.current_tenant_id() and public.current_role_name() = 'tenant_admin')
  with check (id = public.current_tenant_id() and public.current_role_name() = 'tenant_admin');

-- 公開看車頁（/inventory）：車行名稱/電話/地址/營業時間本來就是要給顧客
-- 看的公開營業資訊，開放給未登入訪客（anon）跟登入使用者都能讀取。
-- 不會洩漏任何內部資料——tenants 表本身沒有存任何財務/帳務欄位。
drop policy if exists "tenants_public_read" on public.tenants;
create policy "tenants_public_read"
  on public.tenants for select
  to anon, authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- profiles policies
-- -----------------------------------------------------------------------------
-- super_admin：完全讀寫所有使用者。
drop policy if exists "profiles_super_admin_all" on public.profiles;
create policy "profiles_super_admin_all"
  on public.profiles for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- 任何已登入使用者：可讀取/更新自己的 profile。
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- tenant_admin / staff：可讀取同車行的其他員工資料。
drop policy if exists "profiles_select_same_tenant" on public.profiles;
create policy "profiles_select_same_tenant"
  on public.profiles for select
  using (
    tenant_id is not null
    and tenant_id = public.current_tenant_id()
  );

-- 角色權限管理（RBAC）：車行管理員可以修改「同車行」其他員工的角色與三個
-- 權限開關（can_view_cost / can_view_salary / can_edit_cars），也可以把
-- 員工「移出本車行」（見 settings-module.tsx 的 handleRemoveStaff，做法是
-- 把該員工的 tenant_id 更新成 null，解除跟這間車行的連結）。
-- with check 特別限制 role 只能設成 tenant_admin 或 staff——不能透過這個
-- policy 把自己或別人的角色改成 super_admin（防止權限提升）；tenant_id
-- 允許維持原車行（改角色/權限用）或改成 null（移出車行用）這兩種結果，
-- 但不允許改成「別間車行的 tenant_id」——因為管理員自己的
-- current_tenant_id() 是固定值，這裡沒有開放「current_tenant_id() 以外、
-- 又不是 null」的第三種可能，不會造成把員工轉移到別的車行這種資料外洩
-- 風險。
--
-- 2026-08 修正：原本 with check 要求「改完之後 tenant_id 一定要等於管理員
-- 自己的 tenant_id」，這在邏輯上直接堵死「移出本車行」這個操作（那個
-- 操作的整個目的就是把 tenant_id 改成 null），導致「帳號與權限管理」頁
-- 的「移出本車行」按鈕對任何車行的管理員來說都一定失敗，不是「這個人不是
-- 管理員」的問題。同時把 role 檢查獨立出來、對「留在原車行」跟「移出」
-- 兩種情況都適用，避免「移出」這個分支變成可以順便把目標帳號的 role 改成
-- super_admin 的提權漏洞。
-- 實際上要防止「自己改自己」這種誤操作，是在 Server Action 那層擋
-- （見 src/app/dashboard/staff-actions.ts；「移出本車行」則是前端擋，見
-- settings-module.tsx 的 isSelf 判斷），RLS 這裡只負責租戶邊界跟角色提升
-- 這兩件事。
drop policy if exists "profiles_tenant_admin_manage" on public.profiles;
create policy "profiles_tenant_admin_manage"
  on public.profiles for update
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() = 'tenant_admin'
  )
  with check (
    public.current_role_name() = 'tenant_admin'
    and role in ('tenant_admin', 'staff')
    and (tenant_id = public.current_tenant_id() or tenant_id is null)
  );

-- 2026-08：另外還有一個 BEFORE UPDATE trigger 疊加在 profiles 表上，功能
-- 上跟上面這條 RLS policy 幾乎一樣（多一層防線），這裡一併補進文件——
-- 這個 trigger 先前只存在於線上資料庫，這份檔案裡漏記，導致後續維護時
-- 誤以為只有上面那條 RLS policy 在把關，這次順便補齊，避免下次又對不上。
create or replace function public.guard_profiles_sensitive_update()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (new.role is distinct from old.role)
     or (new.tenant_id is distinct from old.tenant_id)
     or (new.can_view_cost is distinct from old.can_view_cost)
     or (new.can_view_salary is distinct from old.can_view_salary)
     or (new.can_edit_cars is distinct from old.can_edit_cars)
  then
    if public.is_super_admin() then
      return new;
    end if;

    if public.current_role_name() = 'tenant_admin'
       and new.id <> auth.uid()
       and new.role = any (array['tenant_admin', 'staff'])
       and (
         -- 原本的方向：本來就在自己車行的人，改權限、改角色，或移出
         -- （tenant_id 變成 null）。
         (old.tenant_id = public.current_tenant_id() and (new.tenant_id = old.tenant_id or new.tenant_id is null))
         -- 2026-08 新增的方向：一個目前沒有車行（tenant_id is null）的
         -- 舊帳號，被接回自己車行——restore_staff_to_tenant() 專用（見
         -- 下方說明），那支函式自己會先確認這個人「上次就是被自己車行
         -- 移出的」才會走到這個 UPDATE，這裡不重複判斷，只負責放行這個
         -- transition 本身不再被這道防線多餘擋下來。
         or (old.tenant_id is null and new.tenant_id = public.current_tenant_id())
       )
    then
      return new;
    end if;

    raise exception '沒有權限變更角色或權限設定' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_profiles_sensitive_update on public.profiles;
create trigger guard_profiles_sensitive_update
  before update on public.profiles
  for each row execute function public.guard_profiles_sensitive_update();

-- 「移出本車行」（settings-module.tsx 的 handleRemoveStaff）改用這支
-- SECURITY DEFINER 函式，不再直接對 profiles 下 client-side .update()。
--
-- 原因：實測發現，就算上面 RLS policy／trigger 都已經放行「tenant_id 改
-- 成 null」這件事，PostgreSQL 對 UPDATE 還有一條內建規則——「改完之後的
-- 新資料列，必須還能通過資料表上其他 SELECT policy 的檢查」，否則照樣會
-- 被 RLS 擋下來（new row violates row-level security policy）。但「移出
-- 本車行」的目的正是讓這筆資料在任何 SELECT policy 底下都不再可見（不
-- 屬於任何車行），這跟那條內建規則互相矛盾。不能靠放寬 SELECT policy
-- 解決——那樣會變成任何車行的管理員都能查到「全平台」被移出過的員工
-- 名單，造成跨車行資料外洩。改用 SECURITY DEFINER 函式，內部不受呼叫者
-- 的 RLS 限制，改成在函式自己的程式邏輯裡明確檢查權限，檢查嚴謹程度不輸
-- RLS，只是用程式碼明確表達，不依賴「改完是否還看得到」這個 RLS 的隱性
-- 前提。
create or replace function public.remove_staff_from_tenant(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_tenant uuid;
begin
  if public.current_role_name() <> 'tenant_admin' then
    raise exception '沒有權限執行這項操作，請聯繫車行管理員。' using errcode = '42501';
  end if;

  if target_id = auth.uid() then
    raise exception '無法在這裡移除自己，請請另一位管理員協助。' using errcode = '42501';
  end if;

  v_caller_tenant := public.current_tenant_id();

  -- removed_from_tenant_id：記下是被哪間車行移出的，讓同一間車行之後
  -- 可以用 restore_staff_to_tenant()（見下方）把人接回來，見該函式上方
  -- 的完整說明。
  update public.profiles
    set tenant_id = null,
        removed_from_tenant_id = v_caller_tenant,
        can_view_cost = false,
        can_view_salary = false,
        can_edit_cars = false
    where id = target_id
      and tenant_id = v_caller_tenant;

  if not found then
    raise exception '找不到這個員工，或該員工不屬於你的車行。' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.remove_staff_from_tenant(uuid) to authenticated;

-- 2026-08：「重新邀請剛移出的員工」——移出本車行只是把 tenant_id 設回
-- null，這個帳號在 auth.users 裡本來就還在（Email、密碼都還在），並不是
-- 真的刪除。這代表如果車行管理員之後想把同一個人加回來，直接照舊流程
-- 呼叫 Supabase 的 inviteUserByEmail() 一定會被 Supabase 擋下來（回傳
-- 「這個 Email 已經有帳號了」），因為帳號真的還在、不需要也不能重新
-- 「建立」一次。以前這裡完全沒有處理這個情境，車行管理員自己按過一次
-- 「移出本車行」之後想反悔加回來，就會直接卡死在這個錯誤訊息，只能請
-- 開發者手動到後台資料庫改（第一次踩到這個問題就是這樣手動修的）。
--
-- 記錄「這個帳號上一次是被哪個車行移出的」（removed_from_tenant_id），
-- 讓同一間車行之後想重新邀請「同一個」被自己移出過的人時，可以在
-- inviteStaffMember()（見 src/app/dashboard/staff-actions.ts）寄出邀請信
-- 之前，先呼叫下面的 restore_staff_to_tenant()，直接把他接回來、套用
-- 這次表單填的角色/權限，完全不會、也不需要走 Supabase 邀請信那一段
-- （他本來就有密碼，不需要重設）。
--
-- 只記「最後一次是被誰移出的」這一筆，不記錄「歷史上曾經待過哪些車行」
-- 的完整名單，接回去之後就清空——避免有心人拿別間車行「用過」的員工
-- Email 亂猜、亂邀請，只有「剛好是同一間車行」才能把人接回來，其餘情況
-- （全新 Email、或這個 Email 目前屬於其他車行/其他狀況）一律維持原本
-- 「已經有帳號了，無法重複邀請」的擋法，不能讓任何車行都能撿走別的車行
-- 的舊員工帳號。
alter table public.profiles add column if not exists removed_from_tenant_id uuid references public.tenants (id) on delete set null;

comment on column public.profiles.removed_from_tenant_id is
  '此帳號上一次被移出的車行 id（tenant_id 被設回 null 時記錄），只有同一間車行重新邀請同一個 Email 才能直接接回來；成功接回後清空。與「目前所屬車行」tenant_id 無關，tenant_id 有值時這欄應為 null。';

-- remove_staff_from_tenant() 移出時順便記錄是被哪間車行移出的（上面的
-- 函式定義已經是最新版，這裡不重複貼一次完整定義；只在此處註明這個
-- 欄位是從這個函式的哪個時間點開始被寫入的）。

create or replace function public.restore_staff_to_tenant(
  p_email text,
  p_role text,
  p_can_view_cost boolean default false,
  p_can_view_salary boolean default false,
  p_can_edit_cars boolean default false
)
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_tenant uuid;
  v_target_id uuid;
  v_target_name text;
begin
  if public.current_role_name() <> 'tenant_admin' then
    raise exception '沒有權限執行這項操作，請聯繫車行管理員。' using errcode = '42501';
  end if;

  if p_role not in ('tenant_admin', 'staff') then
    raise exception '角色不正確。' using errcode = '22023';
  end if;

  v_caller_tenant := public.current_tenant_id();

  select p.id, p.name into v_target_id, v_target_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower(trim(p_email))
    and p.tenant_id is null
    and p.removed_from_tenant_id = v_caller_tenant
  limit 1;

  if v_target_id is null then
    return;
  end if;

  update public.profiles as p
    set tenant_id = v_caller_tenant,
        role = p_role,
        can_view_cost = p_can_view_cost,
        can_view_salary = p_can_view_salary,
        can_edit_cars = p_can_edit_cars,
        removed_from_tenant_id = null
    where p.id = v_target_id;

  return query select v_target_id, v_target_name;
end;
$$;

grant execute on function public.restore_staff_to_tenant(text, text, boolean, boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- cars policies
-- -----------------------------------------------------------------------------
drop policy if exists "cars_super_admin_all" on public.cars;
create policy "cars_super_admin_all"
  on public.cars for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- tenant_admin / staff：強制限制只能讀寫與自己 tenant_id 相同的車輛。
drop policy if exists "cars_tenant_scoped" on public.cars;
create policy "cars_tenant_scoped"
  on public.cars for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- 公開看車頁（/inventory）：未登入訪客（anon）跟登入使用者都能讀取「已
-- 開放前台顯示、還沒賣掉」的車輛列——僅限 SELECT，不能新增/修改/刪除。
-- 前端（src/app/inventory/page.tsx）的 select 欄位清單本來就只挑
-- brand/model_name/year/color/selling_price/image_url 這幾個公開欄位，
-- 這條 policy 是資料庫層再把關一次：就算前端程式碼以後不小心 select *，
-- 未登入訪客的查詢一樣只會篩出符合這個條件的「列」，但 RLS 本身不會過濾
-- 「欄」——敏感欄位不外洩最終還是要靠前端的 select 欄位清單，這點在
-- inventory/page.tsx 裡有特別註明。
-- 2026-08 加上 tenant.status = 'active' 條件：新註冊車商在 Super Admin
-- 審核核准之前，就算車輛本身 is_public = true，展間也不該對外開放
-- （見 tenants.status 欄位的說明）。
drop policy if exists "cars_public_showroom_read" on public.cars;
create policy "cars_public_showroom_read"
  on public.cars for select
  to anon, authenticated
  using (
    is_public = true
    and status <> 'sold'
    and deleted_at is null
    and exists (
      select 1 from public.tenants t
      where t.id = cars.tenant_id and t.status = 'active'
    )
  );

-- -----------------------------------------------------------------------------
-- transactions policies
-- -----------------------------------------------------------------------------
drop policy if exists "transactions_super_admin_all" on public.transactions;
create policy "transactions_super_admin_all"
  on public.transactions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- tenant_admin / staff：強制限制只能讀寫與自己 tenant_id 相同的收支紀錄。
drop policy if exists "transactions_tenant_scoped" on public.transactions;
create policy "transactions_tenant_scoped"
  on public.transactions for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- repair_items policies
-- -----------------------------------------------------------------------------
-- 注意：RLS 只管「能不能碰到這一列資料」，不區分「業務只能新增、會計才能
-- 核准」這種角色層級的操作限制 —— 那一層是在應用層做的（見
-- src/app/dashboard/repair-items-actions.ts 的 reviewRepairItem()，只有
-- tenant_admin 能核准/退回），RLS 這裡維持跟 cars/transactions 一致的
-- 「只能碰自己車行的資料」即可。
drop policy if exists "repair_items_super_admin_all" on public.repair_items;
create policy "repair_items_super_admin_all"
  on public.repair_items for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "repair_items_tenant_scoped" on public.repair_items;
create policy "repair_items_tenant_scoped"
  on public.repair_items for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- customers policies
-- -----------------------------------------------------------------------------
drop policy if exists "customers_super_admin_all" on public.customers;
create policy "customers_super_admin_all"
  on public.customers for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "customers_tenant_scoped" on public.customers;
create policy "customers_tenant_scoped"
  on public.customers for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- deals policies
-- -----------------------------------------------------------------------------
drop policy if exists "deals_super_admin_all" on public.deals;
create policy "deals_super_admin_all"
  on public.deals for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "deals_tenant_scoped" on public.deals;
create policy "deals_tenant_scoped"
  on public.deals for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- Supabase Storage：車輛照片（公開）／維修單據（私有）
-- -----------------------------------------------------------------------------
-- car-photos：公開讀取（車輛展示照本來就是要給人看的，物件路徑帶隨機字串，
-- 沒有猜到完整路徑的人看不到；但為了畫面上能直接用 <img src> 顯示，不走
-- signed URL）。repair-evidences：私有，維修單據/發票是財務憑證，讀取一律
-- 透過伺服器端簽發短效期 signed URL，不開放公開存取。
-- 這段要放在 current_tenant_id() / is_super_admin() 定義「之後」，
-- 因為下面的 policy 會呼叫這兩個函式。
insert into storage.buckets (id, name, public)
values ('car-photos', 'car-photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('repair-evidences', 'repair-evidences', false)
on conflict (id) do nothing;
-- 註：舊版曾經用過 'repair-receipts' 這個 bucket 名稱，程式碼已經全面改
-- 用上面的 'repair-evidences'。這裡刻意不刪舊 bucket（避免動到裡面可能
-- 還留著的舊檔案），如果 Supabase 專案裡還看得到 repair-receipts，那是
-- 沒有再被使用的舊資料，需要的話可以之後手動清理。

-- 上傳路徑一律是 "<tenant_id>/<car_id>/<檔名>"。
--
-- 2026-08 修復：write/delete 一度放寬成「只要已登入就能寫」（見下面保留
-- 的舊 policy 名稱、continue drop 的原因），理由是舊版用
-- storage.foldername(name) 比對 tenant_id 時，在某次測試中誤擋了合法
-- 使用者上傳自己車行的照片。但這個放寬造成真正的跨租戶漏洞：任何車行的
-- 已登入使用者都能刪除/覆蓋別間車行的照片，或讀取/刪除別間車行的維修
-- 憑證——已經用真實 session 實測證實（car-photos 允許寫入完全不相干的
-- tenant_id 資料夾）。現在重新用 storage.foldername(name)[1] 比對
-- current_tenant_id()，並在這個 Supabase 專案上重新測試過寫入/刪除/
-- 跨租戶阻擋三種情境都正常，才正式收回這個放寬。
--
-- car-photos 的 SELECT 維持完全公開（車輛展示照本來就是要給人看的，畫面
-- 上要能直接用 <img src> 顯示，不走 signed URL）；repair-evidences 全部
-- 四種操作都收緊成只能碰自己車行的路徑，因為維修憑證是私密財務文件。
-- super_admin 另外開一條全 bucket 通行的 policy，跟其他資料表的
-- `xxx_super_admin_all` policy 一致，方便平台管理員排查問題。
drop policy if exists "car_photos_public_read" on storage.objects;
create policy "car_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'car-photos');

drop policy if exists "car_photos_authenticated_write" on storage.objects;
drop policy if exists "car_photos_tenant_write" on storage.objects;
create policy "car_photos_tenant_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists "car_photos_authenticated_delete" on storage.objects;
drop policy if exists "car_photos_tenant_delete" on storage.objects;
create policy "car_photos_tenant_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists "car_photos_super_admin_all" on storage.objects;
create policy "car_photos_super_admin_all"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'car-photos' and public.is_super_admin())
  with check (bucket_id = 'car-photos' and public.is_super_admin());

drop policy if exists "repair_receipts_tenant_read" on storage.objects;
drop policy if exists "repair_evidences_authenticated_read" on storage.objects;
drop policy if exists "repair_evidences_tenant_read" on storage.objects;
create policy "repair_evidences_tenant_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'repair-evidences'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists "repair_receipts_tenant_write" on storage.objects;
drop policy if exists "repair_evidences_authenticated_write" on storage.objects;
drop policy if exists "repair_evidences_tenant_write" on storage.objects;
create policy "repair_evidences_tenant_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'repair-evidences'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists "repair_receipts_tenant_delete" on storage.objects;
drop policy if exists "repair_evidences_authenticated_delete" on storage.objects;
drop policy if exists "repair_evidences_tenant_delete" on storage.objects;
create policy "repair_evidences_tenant_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'repair-evidences'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists "repair_evidences_super_admin_all" on storage.objects;
create policy "repair_evidences_super_admin_all"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'repair-evidences' and public.is_super_admin())
  with check (bucket_id = 'repair-evidences' and public.is_super_admin());

-- storage.objects / storage.buckets 一般由 Supabase 平台預先設定好
-- authenticated 角色的權限，這裡明確再補一次 GRANT，跟本檔案其他資料表
-- 一致的做法（見上面「permission denied for table profiles」的說明），
-- 避免任何專案設定差異導致 GRANT 缺漏、RLS 之外又多一層權限被拒絕。
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

-- =============================================================================
-- 新用戶自動建立 profile（含商業化自助註冊：自動建立車行 + tenant_admin）
-- =============================================================================
-- auth.users 新增使用者時自動執行。前端 /login 註冊表單（見
-- src/app/login/actions.ts 的 signup()）會把「車行/公司名稱」放進
-- signUp() 的 options.data.company_name，這個 trigger 讀出來後：
--
--   1. 在 tenants 建立一間屬於這位使用者的新車行。
--   2. 把這位使用者的 profiles.tenant_id 綁到剛建立的車行。
--   3. 把這位使用者的 profiles.role 設為 tenant_admin（車行管理者/老闆）。
--
-- 這個 function 是 SECURITY DEFINER，執行時不受呼叫者的 RLS 限制，
-- 是唯一允許「一般訪客自助註冊」間接寫入 tenants 表的路徑 —— 一般使用者
-- 本身沒有權限直接 insert tenants（見上面 tenants policies）。
--
-- 如果 signUp() 沒有帶 company_name（例如未來要做「管理員邀請員工」的
-- 流程），則維持舊行為：建立一個尚未指派車行的 staff 帳號，待 tenant_admin
-- 或 super_admin 手動指派 tenant_id。
--
-- 為什麼用資料庫 trigger、而不是在 Next.js 的 Server Action 裡依序呼叫
-- 「signUp() -> insert tenants -> insert profiles」三個步驟：
-- Postgres trigger 是 AFTER INSERT ON auth.users，跟這次 insert 的
-- 「觸發它的那個 INSERT」在同一個資料庫交易 (transaction) 裡執行 ——
-- 只要這個 function 裡任何一步失敗（例如 insert profiles 違反
-- check 限制），整個交易（含 auth.users 那筆 insert 本身）都會被
-- Postgres 自動 rollback，signUp() 會直接收到錯誤、不會留下「auth.users
-- 有帳號、但 profiles 沒資料」的孤兒帳號。這是資料庫原生的 ACID 保證。
-- 如果改成在 Server Action 裡分開呼叫三個 API，中間任何一步網路失敗、
-- RLS 擋下、或 Server Action 中途被中斷，都無法回溯已經成功的前面幾步
-- （signUp() 呼叫的是 Supabase Auth 的獨立服務，不在同一個 DB 交易裡），
-- 反而更容易產生孤兒帳號 —— 所以刻意保留 trigger 這個作法，不要移到
-- Server Action。
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
  company_name  text;
begin
  company_name := nullif(trim(new.raw_user_meta_data ->> 'company_name'), '');

  if company_name is not null then
    insert into public.tenants (name)
    values (company_name)
    returning id into new_tenant_id;

    insert into public.profiles (id, tenant_id, role, name)
    values (
      new.id,
      new_tenant_id,
      'tenant_admin',
      coalesce(new.raw_user_meta_data ->> 'name', new.email)
    )
    on conflict (id) do update
      set tenant_id = excluded.tenant_id,
          role = excluded.role,
          name = excluded.name;
  else
    insert into public.profiles (id, name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email))
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 手動建立第一位 super_admin（範例）
-- =============================================================================
-- 車行老闆（tenant_admin）跟自己的車行（tenants）現在會在 /login 註冊時
-- 自動建立，不需要手動處理。但 super_admin 沒有自助註冊的入口（刻意的：
-- 平台管理權限不該讓任何人自己在網頁上申請），必須手動從既有帳號升級：
--
-- 1. 先讓該使用者用 /login 的「註冊新帳號」正常註冊一次（會自動變成
--    某間車行的 tenant_admin，這是預期中的中間狀態）。
-- 2. 執行下列 SQL，把該使用者升級為 super_admin（會脫離原本的車行）：
--
--   update public.profiles
--   set role = 'super_admin', tenant_id = null
--   where id = '<該使用者的 auth.users.id>';
-- =============================================================================
