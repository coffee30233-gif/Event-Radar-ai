"use client";

import { useEffect } from "react";

/** 註冊 Service Worker，只做離線快取，不含 Push（Lite 版不做 Web Push）。 */
export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 註冊失敗不影響一般瀏覽功能，安靜失敗即可
      });
    }
  }, []);
  return null;
}
