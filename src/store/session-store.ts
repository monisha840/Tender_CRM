import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { RegionFilter } from "@/lib/data/shared";
import type { Id } from "@/types";

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
      /* ignore */
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

export const DEFAULT_USER_ID: Id = "usr_stalin";

interface SessionState {
  /** The persona chosen in the role switcher. There is no login in the MVP. */
  currentUserId: Id;
  /** Region filter shared by dashboards and lists (remembered between visits). */
  regionFilter: RegionFilter;
  sidebarCollapsed: boolean;
  switchUser: (id: Id) => void;
  setRegionFilter: (filter: RegionFilter) => void;
  toggleSidebar: () => void;
}

/** Small and separate from the data store so UI changes don't re-serialise the whole database. */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      currentUserId: DEFAULT_USER_ID,
      regionFilter: "ALL",
      sidebarCollapsed: false,
      switchUser: (id) => set({ currentUserId: id, regionFilter: "ALL" }),
      setRegionFilter: (filter) => set({ regionFilter: filter }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: "sprince-tool:session", version: 2, storage: safeStorage, skipHydration: true },
  ),
);
