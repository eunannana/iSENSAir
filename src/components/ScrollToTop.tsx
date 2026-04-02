"use client";

import { useEffect } from "react";

export default function ScrollToTop() {
  useEffect(() => {
    // Disable automatic scroll restoration saat navigate/refresh
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    // Scroll ke atas saat component mount
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    // Cleanup: restore ke default jika perlu
    return () => {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "auto";
      }
    };
  }, []);

  return null;
}
