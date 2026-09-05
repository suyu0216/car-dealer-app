import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 2026-09-05 新增：新增/編輯車輛表單一次送出多張照片（走 Server Action
  // 的 FormData，不是另外走 API Route），Next.js 預設把 Server Action 的
  // request body 限制在 1MB——只要選比較多張或比較大的照片（即使前端已經
  // 先壓縮過，見 use-image-compress-on-change.ts），加總還是很容易超過
  // 1MB，就會直接跳「Body exceeded 1 MB limit」的 Runtime Error，車輛完全
  // 存不進去。這裡把上限調高到 10MB，給多張照片留足夠空間。
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
