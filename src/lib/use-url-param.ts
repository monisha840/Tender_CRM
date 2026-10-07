"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Reads one query-string value (e.g. `?salary=pending`) without needing a Suspense boundary. `null` on the server and when absent. */
export function useUrlParam(name: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
