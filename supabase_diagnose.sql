-- =============================================================================
-- 唯讀診斷腳本：確認 handle_new_user() trigger 是否真的有正確運作
-- =============================================================================
-- 不會修改任何資料，可以隨時安全執行。用來直接回答：
--   1. on_auth_user_created trigger 到底存不存在、是不是 enabled？
--   2. 最近幾筆註冊，有沒有真的補到 profiles / tenants？
--   3. 有沒有帳號卡在「email 沒驗證」或「有 profile 但沒有 tenant」？
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Trigger 本身是否存在、是否啟用
-- -----------------------------------------------------------------------------
-- tgenabled 應該是 'O'（origin，正常啟用）。
-- 如果這條查詢完全沒有回傳任何列，代表 trigger 根本沒有被建立成功 ——
-- 很可能是 supabase_schema.sql 執行到一半失敗、沒有跑到建立 trigger 那段。
select
  tgname            as trigger_name,
  tgenabled         as status,          -- 'O' = 正常啟用
  tgrelid::regclass as on_table
from pg_trigger
where tgname = 'on_auth_user_created';

-- -----------------------------------------------------------------------------
-- 2. handle_new_user() function 目前實際的定義
-- -----------------------------------------------------------------------------
-- 確認資料庫上真正在跑的版本，跟 supabase_schema.sql 裡的最新版一致
-- （尤其是有沒有「讀 company_name 建 tenant」那段邏輯）。
select pg_get_functiondef('public.handle_new_user()'::regprocedure);

-- -----------------------------------------------------------------------------
-- 3. 最近 20 筆帳號，逐一檢查 profile / tenant 是否補齊
-- -----------------------------------------------------------------------------
-- has_profile 應該全部是 true。
-- role 是 tenant_admin 的話，tenant_id / tenant_name 也應該有值，不是 null。
select
  u.id,
  u.email,
  u.created_at,
  u.email_confirmed_at is not null       as email_confirmed,
  u.raw_user_meta_data ->> 'company_name' as signup_company_name,
  (p.id is not null)                     as has_profile,
  p.role,
  p.tenant_id,
  t.name                                 as tenant_name
from auth.users u
left join public.profiles p on p.id = u.id
left join public.tenants t on t.id = p.tenant_id
order by u.created_at desc
limit 20;

-- -----------------------------------------------------------------------------
-- 4. 有問題的帳號（有其中一項不對勁）
-- -----------------------------------------------------------------------------
-- 正常情況這條應該回傳 0 筆。有回傳的話，看 issue 欄位知道是哪一種問題。
select
  u.id,
  u.email,
  u.created_at,
  case
    when p.id is null then '沒有 profile（trigger 沒補上）'
    when p.role = 'tenant_admin' and p.tenant_id is null then 'tenant_admin 但沒有 tenant_id'
    when p.tenant_id is not null and t.id is null then 'tenant_id 指向不存在的 tenant'
    when u.email_confirmed_at is null then 'email 尚未驗證'
  end as issue
from auth.users u
left join public.profiles p on p.id = u.id
left join public.tenants t on t.id = p.tenant_id
where
  p.id is null
  or (p.role = 'tenant_admin' and p.tenant_id is null)
  or (p.tenant_id is not null and t.id is null)
  or u.email_confirmed_at is null
order by u.created_at desc;
