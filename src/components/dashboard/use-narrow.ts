"use client";

import { useSyncExternalStore } from "react";

/** True below the `md` breakpoint, used to thin out chart ticks on phones. */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}
