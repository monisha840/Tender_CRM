"use client";

import { dbForDate } from "@/lib/data/as-of";
import type { Database } from "@/types";
import { useDb } from "@/store/hooks";
import { useSessionStore } from "@/store/session-store";

/** The database as of the header's date picker (the plain database when no date is chosen). Use for list and dashboard reads. */
export function useAsOfDb(): Database {
  const db = useDb();
  const asOf = useSessionStore((s) => s.asOfDate);
  return dbForDate(db, asOf);
}
