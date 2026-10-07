import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getToday, istToUtc } from "@/lib/dates";
import { buildSeedDatabase, SEED_VERSION } from "@/lib/data/seed";
import type { Database, Id } from "@/types";

/** localStorage that never throws (private mode, quota, blocked storage): the app then runs in-memory. */
const safeStorage = createJSONStorage(() => ({
  getItem: (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable or full: keep working in memory */
    }
  },
  removeItem: (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
}));

export type TableName = keyof Database;
type Row = { id: Id };
/** Per-table edits on top of the seed: rows added or replaced, and ids removed. */
export type Changes = Partial<Record<TableName, { upserts: Record<Id, Row>; removed: Id[] }>>;

/**
 * The seed is large (tens of thousands of rows) and fully deterministic, so it is rebuilt on every load and
 * never stored. Only the user's edits are persisted, as a small overlay applied on top of the seed.
 */
const SEED: Database = buildSeedDatabase();

export function applyChanges(seed: Database, changes: Changes): Database {
  const db = { ...seed } as Record<TableName, Row[]>;
  (Object.keys(changes) as TableName[]).forEach((table) => {
    const change = changes[table];
    if (!change) return;
    const removed = new Set(change.removed);
    const upserts = { ...change.upserts };
    const merged = (seed[table] as unknown as Row[])
      .filter((r) => !removed.has(r.id))
      .map((r) => {
        const replacement = upserts[r.id];
        if (replacement) delete upserts[r.id];
        return replacement ?? r;
      });
    db[table] = [...merged, ...Object.values(upserts)];
  });
  return db as unknown as Database;
}

interface DataState {
  /** The seed with the user's edits applied. */
  db: Database;
  /** Only this is persisted. */
  changes: Changes;
  /** Add or replace a row (by id) in any table. Screens use this for create and edit. */
  upsert: <T extends TableName>(table: T, row: Database[T][number]) => void;
  /** Remove a row. Business records should be soft-deleted with `upsert` and `deletedAt` instead. */
  remove: (table: TableName, id: Id) => void;
  markNotificationRead: (id: Id) => void;
  markAllNotificationsRead: (userId: Id) => void;
  /** Throw away local edits and go back to the seed. */
  resetDemoData: () => void;
}

const withChange = (changes: Changes, table: TableName, fn: (c: { upserts: Record<Id, Row>; removed: Id[] }) => void): Changes => {
  const current = changes[table] ?? { upserts: {}, removed: [] };
  const next = { upserts: { ...current.upserts }, removed: [...current.removed] };
  fn(next);
  return { ...changes, [table]: next };
};

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      db: SEED,
      changes: {},
      upsert: (table, row) =>
        set((s) => {
          const changes = withChange(s.changes, table, (c) => {
            c.upserts[(row as Row).id] = row as Row;
            c.removed = c.removed.filter((id) => id !== (row as Row).id);
          });
          return { changes, db: applyChanges(SEED, changes) };
        }),
      remove: (table, id) =>
        set((s) => {
          const changes = withChange(s.changes, table, (c) => {
            delete c.upserts[id];
            if (!c.removed.includes(id)) c.removed.push(id);
          });
          return { changes, db: applyChanges(SEED, changes) };
        }),
      markNotificationRead: (id) => {
        const n = get().db.notifications.find((x) => x.id === id);
        if (n && !n.readAt) get().upsert("notifications", { ...n, readAt: istToUtc(getToday(), "10:30") });
      },
      markAllNotificationsRead: (userId) =>
        get()
          .db.notifications.filter((n) => n.userId === userId && !n.readAt)
          .forEach((n) => get().markNotificationRead(n.id)),
      resetDemoData: () => set({ changes: {}, db: SEED }),
    }),
    {
      name: "sprince-tool:data",
      version: SEED_VERSION,
      storage: safeStorage,
      // Rehydrate after mount (see AppShell) so the server render and first client render both use the seed.
      skipHydration: true,
      partialize: (s) => ({ changes: s.changes }) as DataState,
      // Seed content changed: old edits may no longer apply, so start clean.
      migrate: () => ({ changes: {} }) as unknown as DataState,
      merge: (persisted, current) => {
        const changes = (persisted as Partial<DataState> | undefined)?.changes ?? {};
        return { ...current, changes, db: applyChanges(SEED, changes) };
      },
    },
  ),
);
