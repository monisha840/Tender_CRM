import type { AuditLog, Database, Id, Notification } from "@/types";
import { entityHref } from "./links";
import { inRegion, type RegionFilter } from "./shared";

export function listNotifications(db: Database, userId: Id, unreadOnly = false): (Notification & { href: string })[] {
  return db.notifications
    .filter((n) => n.userId === userId && (!unreadOnly || !n.readAt))
    .map((n) => ({ ...n, href: entityHref(n.entityType, n.entityId) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const getUnreadCount = (db: Database, userId: Id): number =>
  db.notifications.filter((n) => n.userId === userId && !n.readAt).length;

export interface AuditFilters {
  region?: RegionFilter;
  entityType?: string;
  entityId?: Id;
  search?: string;
  limit?: number;
}

/** Newest first. Audit records are append-only; there is deliberately no mutating function. */
export function listAuditLogs(db: Database, filters: AuditFilters = {}): AuditLog[] {
  const q = filters.search?.trim().toLowerCase();
  const rows = db.auditLogs
    .filter((a) => inRegion(filters.region ?? "ALL", a.regionId))
    .filter((a) => !filters.entityType || a.entityType === filters.entityType)
    .filter((a) => !filters.entityId || a.entityId === filters.entityId)
    .filter((a) => !q || a.summary.toLowerCase().includes(q) || (a.reason ?? "").toLowerCase().includes(q))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return filters.limit ? rows.slice(0, filters.limit) : rows;
}
