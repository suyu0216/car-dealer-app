// 通用「匯出 CSV」小工具——用 Blob + 隱藏 <a> 觸發瀏覽器下載，不需要任何
// 額外套件。Excel 開啟中文 CSV 容易亂碼，前面加 UTF-8 BOM 避免這個問題。
// 2026-09-05 新增，供「報表分析」的幾個報表共用；financial-accounts-
// module.tsx 的收支明細匯出目前是各自獨立寫的一份（已經上線驗證過），
// 沒有一起改成呼叫這支，避免動到已經測試過的程式碼。
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const csv =
    "﻿" +
    [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
