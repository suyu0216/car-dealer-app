"use client";

// 瀏覽器端的圖片壓縮工具——上傳前先用 <canvas> 把使用者選的照片（通常是
// 手機直接拍的原始照片，動輒 3~10MB、四千多 px 寬）縮小、重新編碼，大幅
// 減少「之後每一位訪客看展間頁/車輛列表時要下載的檔案大小」。這是最早
// 解決「網站很卡」問題的主要解法——car-photos bucket 裡原本存的都是原始
// 大圖，展間頁一次要載入好幾張這種圖片，手機或訊號不好時感覺特別明顯。
//
// 2026-08 調整：使用者反映展間頁照片「畫質不夠清晰」，希望「又快又清晰」
// ——原本固定輸出 JPEG（品質 0.82、長邊上限 1600px）確實犧牲了一些畫質
// 換取檔案大小。改成優先輸出 WebP：同樣的視覺畫質下 WebP 通常比 JPEG小
// 25~35%，等於「同樣的檔案大小可以給到明顯更高的品質」，同時滿足快跟
// 清晰兩個需求，不是兩者取捨。長邊上限也從 1600px 提高到 2000px，展間
// 首圖橫幅（最寬可以到 21:9 版面）在桌機大螢幕上會更銳利。瀏覽器不支援
// WebP 編碼的極少數情況（偵測失敗）才退回原本的 JPEG 編碼，不會讓上傳
// 流程卡住。
//
// 純前端處理，不動資料庫欄位、不動 Storage bucket 設定——存進去的檔案
// 本身就已經是處理後的版本，讀取端（showroom-grid.tsx 等，都是原生
// `<img>` 標籤）完全不用改，瀏覽器原生支援顯示 WebP 圖片。
//
// 注意：這只會讓「之後新上傳」的照片套用新設定，已經上傳過的舊照片
// 不會自動被重新處理，要換成更清晰版本的話得重新編辑那台車、重新選一次
// 照片上傳。
const MAX_DIMENSION = 2000; // 長邊上限（px）——展間首圖橫幅在大螢幕桌機也用得到這個解析度
const WEBP_QUALITY = 0.88;
const JPEG_QUALITY = 0.88; // 瀏覽器不支援 WebP 編碼時的退回方案
const SKIP_IF_UNDER_BYTES = 400 * 1024; // 400KB 以下的圖片不重新編碼，避免做白工

/** 偵測目前瀏覽器的 canvas 是否真的能編碼出 WebP（不是每個瀏覽器都支援，
 * 少數情況下 toBlob 對不支援的格式會靜默改回 PNG，不會噴錯，所以不能只
 * 靠 try/catch 判斷，要實際檢查編碼出來的 data URL 開頭是不是
 * "data:image/webp"）。只需要判斷一次，結果快取起來。 */
let webpSupported: boolean | null = null;
function supportsWebP(): boolean {
  if (webpSupported != null) return webpSupported;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpSupported = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupported = false;
  }
  return webpSupported;
}

/**
 * 把一個圖片 File 壓縮成較小的 WebP（不支援時退回 JPEG）；非圖片格式、
 * 已經夠小的圖片，或任何一步處理失敗（例如瀏覽器不支援 canvas 相關 API），
 * 都直接回傳原始檔案，不讓壓縮功能卡住整個上傳流程。
 */
export async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }
  if (file.size <= SKIP_IF_UNDER_BYTES) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const useWebP = supportsWebP();
    const mimeType = useWebP ? "image/webp" : "image/jpeg";
    const quality = useWebP ? WEBP_QUALITY : JPEG_QUALITY;
    const extension = useWebP ? ".webp" : ".jpg";

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, mimeType, quality)
    );
    if (!blob || blob.size >= file.size) {
      // 壓縮後反而更大或沒變小（少見，但偶爾發生在來源本來就已經很小張、
      // 低畫質的圖）——直接用原檔，不做賠本生意。
      return file;
    }

    const newName = file.name.replace(/\.[^.]+$/, "") + extension;
    return new File([blob], newName, { type: mimeType, lastModified: Date.now() });
  } catch {
    return file;
  }
}
