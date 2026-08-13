# 舊官網（超級車庫 / JHC）車輛資料匯入

把 https://cars.super-garage.com.tw/JHC/vehicle-list 的車輛資料與相簿照片，
完整搬進這個專案的 Supabase（`捷恒汽車` 車行）。

實作方式：這個網站前台是 SPA，資料是靠 JS fetch
`dashboard2.super-garage.com.tw/api/car_dealer_front/...` 這組公開 JSON API
拿到的（不需要登入）。比起用瀏覽器逐頁點擊解析 DOM，直接呼叫這組 API 快很多
也穩很多，所以三支腳本都是用 Playwright 的 `request` context（HTTP 層，不開
瀏覽器）而不是完整的頁面自動化。

## 執行步驟

```powershell
# 1. 抓車輛清單 + 每輛車詳情（含相簿照片網址），存到 data/vehicles.json
node scripts/migrate-super-garage/1-scrape.mjs

# 2. 把相簿照片下載到本機 data/photos/<vehicle_id>/
node scripts/migrate-super-garage/2-download-photos.mjs

# 3. 登入 Supabase、把車輛 + 照片寫進資料庫（見下方「執行前必看」）
node scripts/migrate-super-garage/3-import.mjs

# (選用) 用登入身分重新核對 Supabase 裡實際的車輛數/照片數是否跟本機資料一致
node scripts/migrate-super-garage/verify.mjs
```

三支都可以安全重跑（中斷了直接重跑就好，不會重複抓/重複下載/重複建立車輛）：
- `1-scrape.mjs`：每次重跑都會整份重新抓（車輛清單本來就會隨時間變動）。
- `2-download-photos.mjs`：本機檔案已存在就跳過。
- `3-import.mjs`：進度記在 `data/import-map.json`，car 已建立、照片上傳到
  哪一張都有記錄，重跑只會接續做還沒做完的部分。

## 執行 `3-import.mjs` 前必看

1. 這支腳本要用 anon key + 一組「捷恒汽車」車行帳號的 email/密碼登入
   （這樣寫入的每一列資料才會通過 RLS、自動歸到正確的 tenant_id）。
   **請自己**在專案根目錄的 `.env.local` 加上這兩行（不要把密碼貼在對話
   或任何聊天記錄裡）：

   ```
   SCRAPER_EMAIL=你的帳號 email
   SCRAPER_PASSWORD=你的密碼
   ```

   這個帳號必須是「捷恒汽車」這個車行底下已經存在的使用者（tenant_admin
   或 staff 都可以，staff 需要有 `can_edit_cars` 權限）。

2. 確認 Supabase Storage 的 `car-photos` bucket 額度夠：這次會上傳
   **885 張照片、共約 593 MB**。如果專案在免費方案、額度不夠，請先升級
   方案或清理空間，不然匯入到一半會開始失敗（不過失敗了重跑也沒關係，
   會接續沒傳完的部分）。

## 欄位對應與已知限制

- `status`：舊站的數字狀態對應成 `in_stock` / `reserved` / `sold`
  （0/1/2，從 filter-list 的數量統計 + 列表頁「賀成交」字樣比對確認過）。
- `purchase_price` 固定寫 `0`，`floor_price` / `paid_amount` 等成本欄位一律
  留空——這些是車行內部財務數字，舊官網的公開頁面本來就不會顯示，抓不到，
  需要你自己之後在系統裡補上真實數字。
- 已售出（`sold`）的車輛**不會**自動寫入 `closed_at` /
  `closed_prep_cost` / `closed_total_cost` 這組結帳快照欄位——這幾欄照系統
  原本的設計只在你透過 App 內建的「售出結帳」流程時才會封存，這裡跳過是
  故意的，避免留下數字對不起來的假結帳紀錄。
- 相簿：每張下載回來的照片都會上傳到 `car-photos` bucket 並寫進
  `car_photos`，`cars.image_url`（主圖）會設成第一張照片。
- `vehicle_remarks`（含門市人員聯絡方式等業務備註）會整段寫進
  `condition_notes`。

## 之後想重新整份匯入怎麼辦

正常不需要——腳本設計上是跑一次的「舊資料搬遷」，之後車輛異動請直接在系統
裡維護。如果真的要整份重來（例如發現欄位對應寫錯要全部重灌），刪掉
`data/import-map.json` 再重跑 `3-import.mjs`，就會把 `vehicles.json` 裡的
車輛全部當新資料再建一次（注意：這樣舊的那批不會被自動刪除，會變成重複資
料，要重來前請先手動清掉 Supabase 裡上一輪匯入的車輛）。
