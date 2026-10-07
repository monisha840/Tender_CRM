"use client";

import { createContext, useContext, type ReactNode } from "react";

/** What the client shell needs about the signed-in user (resolved on the server; never used for authorisation). */
export interface ClientSessionUser {
  id: string;
  name: string;
  email: string;
  roleKeys: string[];
  roleLabel: string;
  homePath: string;
  mustChangePassword: boolean;
}

const SessionContext = createContext<ClientSessionUser | null>(null);

export function SessionProvider({ user, children }: { user: ClientSessionUser | null; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** The signed-in user, or null on public pages. */
export const useAuthUser = (): ClientSessionUser | null => useContext(SessionContext);
