-- =============================================================================
-- ⚠️ 危险操作：重置所有測試資料 ⚠️
-- =============================================================================
-- 這支腳本會「永久刪除」以下全部資料，無法復原：
--   - auth.users            所有登入帳號（連帶 Supabase Auth 內部關聯資料，
--                           例如 sessions、identities、refresh tokens 等，
--                           這些表對 auth.users 都是 on delete cascade）
--   - public.profiles       所有使用者資料（透過 profiles.id
--                           references auth.users(id) on delete cascade
--                           自動一併清掉，不用另外下指令）
--   - public.tenants        所有車行
--   - public.cars           所有車輛（透過 cars.tenant_id
--                           references tenants(id) on delete cascade
--                           自動一併清掉）
--   - public.transactions   所有收支紀錄（透過 transactions.tenant_id
--                           references tenants(id) on delete cascade
--                           自動一併清掉）
--
-- 只會清資料列，不會動到 table 結構、RLS policies、trigger、function ——
-- 清完之後不需要重跑 supabase_schema.sql，直接重新註冊帳號即可。
--
-- 執行方式：在 Supabase Dashboard -> SQL Editor 貼上並執行。
-- 建議先跑最下面的「執行前先確認」查詢，看清楚會刪掉多少筆資料再繼續。
-- =============================================================================

-- 執行前先確認：看一下目前有多少筆資料會被清掉。
select
  (select count(*) from auth.users)          as auth_users_count,
  (select count(*) from public.profiles)     as profiles_count,
  (select count(*) from public.tenants)      as tenants_count,
  (select count(*) from public.cars)         as cars_count,
  (select count(*) from public.transactions) as transactions_count;

-- 正式清空 -------------------------------------------------------------------

-- 1. 刪光所有登入帳號。profiles 會透過 FK cascade 自動一起被刪除，
--    不需要另外 delete from public.profiles。
delete from auth.users;

-- 2. 刪光所有車行。cars、transactions 會透過 FK cascade 自動一起被刪除。
delete from public.tenants;

-- 執行後確認：下面五個數字應該全部是 0。
select
  (select count(*) from auth.users)          as auth_users_count,
  (select count(*) from public.profiles)     as profiles_count,
  (select count(*) from public.tenants)      as tenants_count,
  (select count(*) from public.cars)         as cars_count,
  (select count(*) from public.transactions) as transactions_count;
