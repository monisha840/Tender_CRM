"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Links from approvals and notifications arrive as /tenders?focus=<id>; open that tender instead. */
export function FocusRedirect() {
  const router = useRouter();
  const focus = useSearchParams().get("focus");
  useEffect(() => {
    if (focus) router.replace(`/tenders/${encodeURIComponent(focus)}`);
  }, [focus, router]);
  return null;
}
