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

/**
 * 2026-08-31 新增：跟上面 useImageCompressOnChange 同一套壓縮邏輯，差別
 * 是掛在 <input type="file" multiple> 上——一次讀 input.files 裡的「全部」
 * 檔案（不是只取 [0]），逐一壓縮後用同一個 DataTransfer 重新組回
 * input.files，順序維持使用者選擇的順序（第一張會是表單邏輯裡的
 * 「主圖」，見 car-form-modal.tsx 的說明）。安安要求新增車輛的「車輛照片」
 * 要能一次選多張上傳，不想動到其餘還在用單張版本的地方（品牌 Logo／
 * 大頭照／見證照等），所以另外開一個函式，不改原本那個。
 *
 * onSelected（可選）：選檔當下、壓縮開始「前」就會用原始 File[] 呼叫
 * 一次，給畫面上「已選 N 張：a.jpg、b.jpg」這種即時清單用，不用等壓縮
 * 跑完才有回饋。
 */
export function useMultiImageCompressOnChange(onSelected?: (files: File[]) => void) {
  const [compressing, setCompressing] = useState(false);

  const onChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      // 注意：`Array.from(input.files ?? [])` 這種寫法會讓 TypeScript
      // 對 `FileList | never[]` 這個聯集型別的 Array.from() 多載推斷失敗、
      // 整個退化成 `unknown[]`——分開處理 null 分支才會正確推斷出 File[]。
      const files: File[] = input.files ? Array.from(input.files) : [];
      if (files.length === 0) return;

      onSelected?.(files);

      setCompressing(true);
      try {
        const compressed = await Promise.all(files.map((file) => compressImageFile(file)));
        const dt = new DataTransfer();
        for (const file of compressed) dt.items.add(file);
        input.files = dt.files;
      } finally {
        setCompressing(false);
      }
    },
    [onSelected]
  );

  return { onChange, compressing };
}
