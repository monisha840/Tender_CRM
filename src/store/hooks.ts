"use client";

import { useEffect, useMemo, useState } from "react";
import { effectiveRegionFilter, getAllowedRegionIds, getPersona, type Persona } from "@/lib/data/access";
import type { RegionFilter } from "@/lib/data/shared";
import type { Database, Region } from "@/types";
import { useDataStore } from "./data-store";
import { useSessionStore } from "./session-store";

export const useDb = (): Database => useDataStore((s) => s.db);

/** Current persona. Falls back to the first user if a stored id no longer exists (e.g. after a reseed). */
export function useCurrentPersona(): Persona {
  const db = useDb();
  const userId = useSessionStore((s) => s.currentUserId);
  return useMemo(() => {
    const persona = getPersona(db, userId) ?? getPersona(db, db.users[0].id);
    if (!persona) throw new Error("Seed data has no users");
    return persona;
  }, [db, userId]);
}

/** Region filter after clamping to the persona's allowed regions. */
export function useRegionFilter(): { region: RegionFilter; setRegion: (r: RegionFilter) => void; options: Region[] } {
  const db = useDb();
  const persona = useCurrentPersona();
  const chosen = useSessionStore((s) => s.regionFilter);
  const setRegion = useSessionStore((s) => s.setRegionFilter);
  return useMemo(() => {
    const allowed = getAllowedRegionIds(db, persona.user.id);
    return {
      region: effectiveRegionFilter(db, persona.user.id, chosen),
      setRegion,
      options: db.regions.filter((r) => allowed.includes(r.id)),
    };
  }, [db, persona.user.id, chosen, setRegion]);
}

/** True once persisted state has been loaded from localStorage on the client. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const done = () => setHydrated(true);
    if (useDataStore.persist.hasHydrated() && useSessionStore.persist.hasHydrated()) done();
    const offA = useDataStore.persist.onFinishHydration(() => useSessionStore.persist.hasHydrated() && done());
    const offB = useSessionStore.persist.onFinishHydration(() => useDataStore.persist.hasHydrated() && done());
    return () => {
      offA();
      offB();
    };
  }, []);
  return hydrated;
}
