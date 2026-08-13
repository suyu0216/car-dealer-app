-- =============================================================================
-- 中古車行 Demo 種子資料：捷亨汽車
-- =============================================================================
-- 這支腳本會：
--   1. 把「最新註冊」的 auth.users 帳號綁定到示範車行「捷亨汽車」，
--      profiles.role 設為 tenant_admin。
--   2. 灌 5 筆不同狀態、不同廠牌（Benz / Toyota / BMW）的示範車輛。
--   3. 灌 2 筆已完成的收支紀錄，讓 Dashboard 一開始就有數據可看。
--
-- 只用最原始版 schema 就保證存在的欄位：
--   tenants (id, name, created_at)
--   cars    (id, tenant_id, model, status, purchase_price, selling_price, created_at)
--   transactions (id, tenant_id, car_id, date, type, category, amount, note)
-- 不會碰 tenants.phone/address/business_hours、cars.brand/year/mileage 這些
-- 需要另外 alter table 才會有的欄位，所以不管你的專案有沒有跑過那個欄位
-- 擴充，這支腳本都能直接執行成功。廠牌／年份／里程資訊直接寫進 model
-- 欄位裡（例如「Mercedes-Benz C 300 AMG（2021式・3.2萬km）」），不會遺漏。
--
-- 可重複執行：
--   - 帳號綁定：用 upsert，重跑會更新而不是重複建立。
--   - 車輛／交易示範資料：只有在「捷亨汽車」目前還沒有任何車輛時才會灌，
--     避免每次重跑都多出一份重複的示範資料。
--
-- 執行方式：在 Supabase Dashboard -> SQL Editor 貼上並執行。
-- =============================================================================

do $$
declare
  latest_user_id    uuid;
  latest_user_email text;
  demo_tenant_id    uuid;
  car_benz_id       uuid;
  car_bmw_x3_id     uuid;
  already_seeded    boolean;
begin
  -- ---------------------------------------------------------------------------
  -- 1. 找出最新註冊的帳號
  -- ---------------------------------------------------------------------------
  select id, email
    into latest_user_id, latest_user_email
  from auth.users
  order by created_at desc
  limit 1;

  if latest_user_id is null then
    raise exception '找不到任何 auth.users 帳號 —— 請先到 /login 註冊一個帳號，再執行這支腳本。';
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. 取得或建立示範車行「捷亨汽車」
  -- ---------------------------------------------------------------------------
  select id into demo_tenant_id from public.tenants where name = '捷亨汽車' limit 1;

  if demo_tenant_id is null then
    insert into public.tenants (name)
    values ('捷亨汽車')
    returning id into demo_tenant_id;
  end if;

  -- ---------------------------------------------------------------------------
  -- 3. 把最新帳號綁到「捷亨汽車」，設為 tenant_admin
  -- ---------------------------------------------------------------------------
  insert into public.profiles (id, tenant_id, role, name)
  values (
    latest_user_id,
    demo_tenant_id,
    'tenant_admin',
    coalesce(latest_user_email, '車行管理者')
  )
  on conflict (id) do update
    set tenant_id = excluded.tenant_id,
        role      = 'tenant_admin';

  raise notice '已將帳號 % (%) 綁定為「捷亨汽車」的 tenant_admin。', latest_user_email, latest_user_id;

  -- ---------------------------------------------------------------------------
  -- 4. 車輛 + 交易示範資料：只在這間車行還沒有任何車輛時才灌
  -- ---------------------------------------------------------------------------
  select exists(
    select 1 from public.cars where tenant_id = demo_tenant_id
  ) into already_seeded;

  if already_seeded then
    raise notice '「捷亨汽車」已經有車輛資料，略過車輛／交易示範資料（避免重複建立）。';
  else
    -- 已售出
    insert into public.cars (tenant_id, model, status, purchase_price, selling_price)
    values (
      demo_tenant_id,
      'Mercedes-Benz C 300 AMG（2021式・3.2萬km）',
      'sold', 1350000, 1520000
    )
    returning id into car_benz_id;

    -- 上架待售中
    insert into public.cars (tenant_id, model, status, purchase_price, selling_price)
    values (
      demo_tenant_id,
      'Toyota Camry 2.5 豪華版（2022式・1.85萬km）',
      'in_stock', 780000, 899000
    );

    -- 已保留（客戶洽談中）
    insert into public.cars (tenant_id, model, status, purchase_price, selling_price)
    values (
      demo_tenant_id,
      'BMW 320i M Sport（2020式・4.52萬km）',
      'reserved', 980000, 1128000
    );

    -- 上架待售中
    insert into public.cars (tenant_id, model, status, purchase_price, selling_price)
    values (
      demo_tenant_id,
      'Toyota RAV4 2.0 四驅旗艦（2023式・6200km）',
      'in_stock', 1050000, 1188000
    );

    -- 入庫整理中（剛收購，尚未訂出售價）
    insert into public.cars (tenant_id, model, status, purchase_price, selling_price)
    values (
      demo_tenant_id,
      'BMW X3 xDrive30i（2019式・6.1萬km）',
      'in_stock', 1120000, null
    )
    returning id into car_bmw_x3_id;

    -- 收入：賣掉 Benz C300 AMG
    insert into public.transactions (tenant_id, car_id, date, type, category, amount, note)
    values (
      demo_tenant_id, car_benz_id, current_date - 5,
      'income', '車輛銷售', 1520000, 'Benz C 300 AMG 售出，含牌照過戶'
    );

    -- 支出：整備 BMW X3
    insert into public.transactions (tenant_id, car_id, date, type, category, amount, note)
    values (
      demo_tenant_id, car_bmw_x3_id, current_date - 2,
      'expense', '整備維修', 45000, 'BMW X3 進廠鈑烤與定期保養'
    );

    raise notice '已建立示範資料：5 輛車（Benz / Toyota x2 / BMW x2），2 筆收支紀錄。';
  end if;
end $$;

-- =============================================================================
-- 驗證：確認帳號綁定與示範資料都到位
-- =============================================================================
select
  t.name                                                             as tenant,
  (select count(*) from public.profiles where tenant_id = t.id)      as staff_count,
  (select count(*) from public.cars where tenant_id = t.id)          as car_count,
  (select count(*) from public.transactions where tenant_id = t.id)  as transaction_count
from public.tenants t
where t.name = '捷亨汽車';

select id, name, role, tenant_id
from public.profiles
where tenant_id = (select id from public.tenants where name = '捷亨汽車' limit 1);
