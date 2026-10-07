"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Query-string state for list filters (`?status=open&q=korba`), so a filter survives a refresh, the back button
 * and a shared link. Reads need no Suspense boundary (unlike `useSearchParams` with `cacheComponents`), and they
 * stay reactive: same-page `history` updates and Next.js navigations both re-render the readers.
 */

const URL_EVENT = "sprince:urlchange";
let patched = false;

/** `pushState` / `replaceState` do not emit events, so wrap them once and announce each change. */
function patchHistory(): void {
  if (patched) return;
  patched = true;
  (["pushState", "replaceState"] as const).forEach((method) => {
    const original = window.history[method];
    window.history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(URL_EVENT));
      return result;
    };
  });
}

function subscribe(onChange: () => void): () => void {
  patchHistory();
  window.addEventListener(URL_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(URL_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

/** The URL after setting (or, for null / empty, removing) one parameter. Pure, so it can be unit tested. */
export function withUrlParam(search: string, name: string, value: string | null): string {
  const params = new URLSearchParams(search);
  if (value === null || value === "") params.delete(name);
  else params.set(name, value);
  const next = params.toString();
  return next ? `?${next}` : "";
}

/** Writes one parameter without adding a history entry, keeping the path and hash. */
export function setUrlParam(name: string, value: string | null): void {
  const { pathname, search, hash } = window.location;
  const next = withUrlParam(search, name, value);
  if (next === search) return;
  window.history.replaceState(window.history.state, "", `${pathname}${next}${hash}`);
}

/** Reads one query-string value. `null` on the server and when absent. */
export function useUrlParam(name: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}

/**
 * Read-write filter state backed by the URL: `[value, set]`. `value` is `fallback` when the parameter is absent;
 * setting it back to `fallback` (or null) removes the parameter, so the default state has a clean URL.
 */
export function useUrlState(name: string, fallback = ""): [string, (value: string | null) => void] {
  const raw = useUrlParam(name);
  const set = useCallback((value: string | null) => setUrlParam(name, value === fallback ? null : value), [name, fallback]);
  return [raw ?? fallback, set];
}
