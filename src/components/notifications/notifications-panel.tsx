"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { ImportExport } from "@/components/data/import-export";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { listNotifications } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/store/data-store";
import { useCurrentPersona, useDb } from "@/store/hooks";

const humanise = (t: string) => {
  const s = t.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Notifications for the current user: deadlines, approvals and alerts, with read / unread. */
export function NotificationsPanel() {
  const db = useDb();
  const persona = useCurrentPersona();
  const markRead = useDataStore((s) => s.markNotificationRead);
  const markAll = useDataStore((s) => s.markAllNotificationsRead);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState("ALL");

  const all = useMemo(() => listNotifications(db, persona.user.id), [db, persona.user.id]);
  const types = useMemo(() => [...new Set(all.map((n) => n.type))].sort(), [all]);
  const unread = all.filter((n) => !n.readAt).length;
  const rows = all.filter((n) => (!unreadOnly || !n.readAt) && (type === "ALL" || n.type === type));

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You are all caught up"}
        primaryAction={unread ? { label: "Mark all as read", icon: CheckCheck, onClick: () => markAll(persona.user.id) } : undefined}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant={unreadOnly ? "default" : "outline"} className="min-h-11 md:min-h-8" aria-pressed={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
          Unread only
        </Button>
        <label className="sr-only" htmlFor="notif-type">Type</label>
        <select id="notif-type" value={type} onChange={(e) => setType(e.target.value)} className="min-h-11 rounded-md border bg-surface px-2 text-sm md:min-h-8">
          <option value="ALL">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{humanise(t)}</option>
          ))}
        </select>
      </div>
      <ImportExport
        filename="notifications"
        headers={["Date", "Type", "Title", "Details", "Read"]}
        rows={rows.map((n) => [n.createdAt, humanise(n.type), n.title, n.body ?? "", n.readAt ? "Yes" : "No"])}
      />
      {rows.length === 0 ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState icon={BellOff} message="No notifications match. Deadlines and approvals will show up here." />
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-surface">
          {rows.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href}
                onClick={() => markRead(n.id)}
                className={cn("flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-accent-subtle", !n.readAt && "bg-accent-subtle/50")}
              >
                <Bell className={cn("mt-0.5 size-4 shrink-0", n.readAt ? "text-muted-foreground" : "text-accent-strong")} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
                    <span className="tabular text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                  </span>
                  {n.body && <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>}
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {humanise(n.type)}
                    {!n.readAt && <span className="rounded-md bg-accent px-1.5 py-0.5 font-medium text-accent-foreground">New</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
