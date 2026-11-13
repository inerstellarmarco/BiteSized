"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { shouldRefreshOnReturn } from "@/lib/refresh";

// An installed app on a phone stays open in the background, so coming back to
// it shows the page as it was. This reloads the page data (keeping what is on
// screen, such as the current card) when the app returns after a while.
export function RefreshOnReturn() {
  const router = useRouter();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      if (shouldRefreshOnReturn(hiddenAt.current, Date.now())) router.refresh();
      hiddenAt.current = null;
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) router.refresh();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
