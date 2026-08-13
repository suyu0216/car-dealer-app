// 系統品牌設定。預設值是通用產品名稱，不代表任何特定車行 —— 車行自己的
// 名稱存在 tenants.name，登入後的頁面一律顯示 tenants.name，而不是這裡。
// 若要換品牌，改 .env.local 的 NEXT_PUBLIC_APP_NAME 即可，不用改程式碼。
export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "AutoHub 車行雲端管理系統";
