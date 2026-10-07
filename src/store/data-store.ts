import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { buildSeedDatabase, SEED_VERSION } from "@/lib/data/seed";
import { getToday, istToUtc } from "@/lib/dates";
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

interface DataState {
  /** The whole mock database. Starts as the deterministic seed. */
  db: Database;
  markNotificationRead: (id: Id) => void;
  markAllNotificationsRead: (userId: Id) => void;
  /** Throw away local changes and reload the seed. */
  resetDemoData: () => void;
}

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      db: buildSeedDatabase(),
      markNotificationRead: (id) =>
        set((s) => ({
          db: {
            ...s.db,
            notifications: s.db.notifications.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: istToUtc(getToday(), "10:30") } : n)),
          },
        })),
      markAllNotificationsRead: (userId) =>
        set((s) => ({
          db: {
            ...s.db,
            notifications: s.db.notifications.map((n) => (n.userId === userId && !n.readAt ? { ...n, readAt: istToUtc(getToday(), "10:30") } : n)),
          },
        })),
      resetDemoData: () => set({ db: buildSeedDatabase() }),
    }),
    {
      name: "sprince-tool:data",
      version: SEED_VERSION,
      storage: safeStorage,
      // Rehydrate after mount (see StoreProvider) so server and first client render both use the seed.
      skipHydration: true,
      partialize: (s) => ({ db: s.db }) as DataState,
      // Seed content changed: drop stale local data and keep the fresh seed.
      migrate: () => ({ db: buildSeedDatabase() }) as DataState,
    },
  ),
);
