"use client";

// 滾動到畫面內時「慢慢淡入」的包裝元件——用在首頁「熱門車款」「影音專區」
// 「品牌故事」「聯繫我們的業務」這幾個內容區塊，模仿弘達首頁滾動時內容
// 慢慢浮現的高級感（見使用者需求：「他首頁的 服務內容是 慢慢漸變出來的
// 這樣感覺很高級」）。首圖橫幅（hero）不套用——弘達的首圖是一打開就直接
// 看得到，不會淡入，這裡刻意保持一致。
//
// 用瀏覽器原生的 IntersectionObserver，不引入額外的動畫套件：
// - 一開始整個區塊是 opacity-0 + 往下位移一點（translate-y-6）；
// - 區塊進入畫面（哪怕只露出一點點，見 rootMargin）就觸發淡入，
//   opacity-100 + 回到原本位置，用 CSS transition 做漸變動畫；
// - 淡入只會觸發「一次」——一進場就把 observer 關掉（disconnect），
//   所以使用者往回滾動再往下滾，不會整區重新淡入閃一次，比較不會覺得
//   煩躁，也比較貼近弘達實際的行為。
// - SSR/第一次渲染時預設是「已經淡入」的狀態（見下方 `mounted` 的用法），
//   避免使用者停用 JS，或 observer 還沒來得及註冊時，內容整個看不到。
import { useEffect, useRef, useState } from "react";

export function FadeInSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // 瀏覽器不支援 IntersectionObserver 的話（極少見），直接當作可見，
    // 不要讓內容永遠卡在淡出的狀態。
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -80px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={
        "transition-all duration-700 ease-out " +
        (visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6") +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </div>
  );
}
