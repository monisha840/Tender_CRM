"use client";

import { useEffect, useMemo, useState } from "react";
import { effectiveRegionFilter, getAllowedRegionIds, getPersona, type Persona } from "@/lib/data/access";
import type { RegionFilter } from "@/lib/data/shared";
import type { Database, Region } from "@/types";
import { useAuthUser } from "@/components/auth/session-provider";
import { useServerDb } from "@/components/auth/server-db-provider";
import { matchDbUserId } from "@/lib/auth/persona-map";
import { useDataStore } from "./data-store";
import { useSessionStore } from "./session-store";

/**
 * The database every screen reads. With a server provider (every signed-in page) this is the REAL data loaded on the
 * server for the signed-in user; server actions followed by router.refresh() deliver the new snapshot. Without a
 * provider (dev role switcher, styleguide) it falls back to the Zustand demo store.
 */
export function useDb(): Database {
  const server = useServerDb();
  const local = useDataStore((s) => s.db);
  return server ?? local;
}

/**
 * Current persona. With real data it is the signed-in user's own row (matched by id, then e-mail); there is no
 * stand-in persona. Without a server db (dev switcher, styleguide) the stored demo user is used.
 */
export function useCurrentPersona(): Persona {
  const db = useDb();
  const serverDb = useServerDb();
  const storedId = useSessionStore((s) => s.currentUserId);
  const authUser = useAuthUser();
  const userId = serverDb && authUser ? (matchDbUserId(db, authUser) ?? "") : storedId;
  return useMemo(() => {
    const persona = getPersona(db, userId) ?? (serverDb ? null : getPersona(db, db.users[0]?.id ?? ""));
    if (!persona) throw new Error("The signed-in user has no active role in the database");
    return persona;
  }, [db, userId, serverDb]);
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
  // With real data the demo store is not read, so only the (small) session store has to be restored.
  const realData = useServerDb() !== null;
  useEffect(() => {
    const done = () => setHydrated(true);
    const dataReady = () => realData || useDataStore.persist.hasHydrated();
    if (dataReady() && useSessionStore.persist.hasHydrated()) done();
    const offA = useDataStore.persist.onFinishHydration(() => useSessionStore.persist.hasHydrated() && done());
    const offB = useSessionStore.persist.onFinishHydration(() => dataReady() && done());
    return () => {
      offA();
      offB();
    };
  }, [realData]);
  return hydrated;
}
