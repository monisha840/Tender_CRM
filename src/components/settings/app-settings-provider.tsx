"use client";

import { createContext, useContext, type ReactNode } from "react";
import { getAppSettings, setAppSettings, type AppSettings } from "@/modules/settings/runtime";

const Ctx = createContext<AppSettings | null>(null);

/**
 * Installs the server-loaded settings for pure functions (health, urgency, defaults) and exposes them to React.
 * The snapshot is global (not per user), so the module-level copy is the same for every request.
 */
export function AppSettingsProvider({ settings, children }: { settings: AppSettings; children: ReactNode }) {
  setAppSettings(settings);
  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}

export const useAppSettings = (): AppSettings => useContext(Ctx) ?? getAppSettings();
