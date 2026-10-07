"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Database } from "@/types";

/** The server-loaded Database snapshot (real data). Null on public pages and in the dev/styleguide fallback. */
const ServerDbContext = createContext<Database | null>(null);

export function ServerDbProvider({ db, children }: { db: Database | null; children: ReactNode }) {
  return <ServerDbContext.Provider value={db}>{children}</ServerDbContext.Provider>;
}

/** The provided server db, or null when none (then `useDb()` falls back to the Zustand demo store). */
export const useServerDb = (): Database | null => useContext(ServerDbContext);
