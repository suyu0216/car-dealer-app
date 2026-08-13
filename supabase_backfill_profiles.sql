-- =============================================================================
-- 一次性回填：修補「第一世代」舊帳號 —— auth.users 有紀錄、但 profiles 沒有
-- 對應資料，和/或 email 一直卡在未驗證狀態，導致完全無法登入
-- =============================================================================
-- 用途：早期（部署 on_auth_user_created trigger 之前、或透過 Supabase
-- Dashboard 手動建立）的帳號，可能：
--   (a) 從來沒有觸發過自動建立 profile 的流程 -> 登入卡在
--       /login?error=profile_missing；
--   (b) email 從來沒有被驗證過（email_confirmed_at 是 null）->
--       signInWithPassword 直接被 Supabase Auth 擋下，帳密正確也登不進去。
--
-- 這支腳本會把這兩種情況一次修好：
--   1. 幫每一個「profiles 缺資料」的帳號補上 tenants + profiles
--      （固定補成該車行的 tenant_admin，讓帳號補完後立刻可用，不會卡在
--      tenant_id 未指派的狀態）——沒有車行名稱可用時，用 email 帶入一個
--      預設車行名稱，之後可以再到 /super-admin 或直接下 SQL 改名。
--   2. 強制把 email_confirmed_at 補上目前時間（等同直接通過 Email 驗證），
--      讓帳號不需要重新收信驗證就能登入。
--
-- 執行方式：在 Supabase Dashboard -> SQL Editor 貼上並執行一次即可。
-- 這支腳本是「找孤兒帳號」驅動的（left join ... where profile is null），
-- 補完之後就找不到任何列了，所以重複執行也是安全的，不會重複建立資料、
-- 也不會覆蓋掉已經驗證過的 email_confirmed_at（用 coalesce 只補 null）。
--
-- 建議順序：先執行最新版 supabase_schema.sql（確保 trigger 已更新），
-- 再執行這支腳本補齊舊帳號。
-- =============================================================================

do $$
declare
  orphan        record;
  new_tenant_id uuid;
  company_name  text;
  fixed_count   int := 0;
begin
  for orphan in
    select u.id, u.email, u.raw_user_meta_data, u.email_confirmed_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
  loop
    -- 優先用註冊時填的車行名稱；沒有的話（例如從 Dashboard 手動建立的
    -- 舊帳號）就用 email 帶入一個預設名稱，確保補完後這顆帳號一定有
    -- 車行可用，不會卡在「尚未指派車行」的狀態。
    company_name := coalesce(
      nullif(trim(orphan.raw_user_meta_data ->> 'company_name'), ''),
      '未命名車行 - ' || split_part(orphan.email, '@', 1)
    );

    insert into public.tenants (name)
    values (company_name)
    returning id into new_tenant_id;

    insert into public.profiles (id, tenant_id, role, name)
    values (
      orphan.id,
      new_tenant_id,
      'tenant_admin',
      coalesce(orphan.raw_user_meta_data ->> 'name', orphan.email)
    );

    -- 強制通過 Email 驗證：只補 null，已經驗證過的帳號原時間不變。
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = orphan.id;

    raise notice '已修復帳號：% (%) -> 車行「%」，email 驗證狀態：%',
      orphan.email, orphan.id, company_name,
      case when orphan.email_confirmed_at is null then '本次補上' else '原本就已驗證' end;

    fixed_count := fixed_count + 1;
  end loop;

  raise notice '共修復 % 個孤兒帳號。', fixed_count;
end $$;

-- 驗證 1：應該回傳 0 筆 —— 代表沒有孤兒帳號了。
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 驗證 2：應該回傳 0 筆 —— 代表沒有帳號還卡在未驗證 email 的狀態。
select id, email
from auth.users
where email_confirmed_at is null;
