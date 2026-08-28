"use client";

import { useCallback, useState, type ChangeEvent } from "react";
import { compressImageFile } from "@/lib/image-compress";

/**
 * 掛在 <input type="file" accept="image/*"> 的 onChange 上——選好照片後，
 * 先在瀏覽器端把體積壓小（見 lib/image-compress.ts），再把壓縮後的檔案
 * 塞回同一個 input（用 DataTransfer 取代 input.files）。這樣原生
 * <form action={serverAction}> 送出時，FormData 裡拿到的就已經是壓縮後的
 * 檔案，Server Action／storage.ts 那端完全不用改。
 *
 * 回傳的 compressing 在壓縮進行中是 true，呼叫端應該把送出按鈕 disable
 * 掉，避免使用者手速太快、壓縮還沒做完就把原始大檔送出去了。
 *
 * onSelected（可選）：選檔當下、壓縮開始「前」就會用原始 File 呼叫一次，
 * 給預覽圖（URL.createObjectURL）用——預覽不需要等壓縮完成，壓縮前後畫面
 * 肉眼看不出差異，先讓使用者馬上看到選了哪張圖比較有回饋感。
 */
export function useImageCompressOnChange(onSelected?: (file: File) => void) {
  const [compressing, setCompressing] = useState(false);

  const onChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const file = input.files?.[0];
      if (!file) return;

      onSelected?.(file);

      setCompressing(true);
      try {
        const compressed = await compressImageFile(file);
        if (compressed !== file) {
          const dt = new DataTransfer();
          dt.items.add(compressed);
          input.files = dt.files;
        }
      } finally {
        setCompressing(false);
      }
    },
    [onSelected]
  );

  return { onChange, compressing };
}
