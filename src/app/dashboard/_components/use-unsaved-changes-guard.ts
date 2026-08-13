"use client";

import { useState } from "react";

const CONFIRM_MESSAGE = "內容尚未儲存，確定要離開嗎？";

/**
 * 共用的「未存檔離開提示」邏輯，給所有新增/編輯表單彈窗用。
 *
 * 用法：
 *   const { markDirty, requestClose, resetDirty } = useUnsavedChangesGuard(onClose);
 *   ...
 *   <form onChange={markDirty} action={formAction}>
 *   <button onClick={requestClose}>✕</button>   // 或「取消」按鈕
 *
 * 如果表單送出成功後不是整個關閉、而是留在原地清空重填（例如車輛詳情頁
 * 內嵌的「新增維修請款」表單，成功後只是清空繼續填下一筆），記得在
 * 成功的那個 useEffect 裡呼叫 resetDirty()，不然會殘留上一筆已經送出
 * 的「有異動」狀態，之後想收起表單時就會被誤判成「還有未存檔內容」。
 *
 * `<form onChange={...}>` 會利用 React 事件冒泡，表單內任何 input/select/
 * textarea 的變動都會觸發一次，不需要一個一個欄位手動加 onChange。
 *
 * 關閉方式只剩下呼叫 requestClose() 這一種：表單有異動時，用瀏覽器原生
 * confirm() 跳出二次確認（『內容尚未儲存，確定要離開嗎？』），使用者按
 * 「確定」才真的關閉，按「取消」（=繼續編輯）就什麼都不做、留在原表單。
 * 背景（Backdrop）本身刻意不綁 onClick，點擊視窗外一律不會關閉。
 */
export function useUnsavedChangesGuard(onClose: () => void) {
  const [dirty, setDirty] = useState(false);

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  function requestClose() {
    if (dirty && !window.confirm(CONFIRM_MESSAGE)) {
      return;
    }
    onClose();
  }

  function resetDirty() {
    setDirty(false);
  }

  return { dirty, markDirty, requestClose, resetDirty };
}
