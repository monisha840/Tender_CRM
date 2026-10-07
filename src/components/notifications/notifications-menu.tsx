"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { listNotifications } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/store/data-store";
import { useCurrentPersona, useDb } from "@/store/hooks";

const MAX_SHOWN = 8;

/** Bell in the top bar: a small list of recent notifications; each opens its related record. */
export function NotificationsMenu() {
  const router = useRouter();
  const db = useDb();
  const persona = useCurrentPersona();
  const markRead = useDataStore((s) => s.markNotificationRead);
  const markAll = useDataStore((s) => s.markAllNotificationsRead);

  const all = useMemo(() => listNotifications(db, persona.user.id), [db, persona.user.id]);
  const unread = all.filter((n) => !n.readAt).length;
  const shown = all.slice(0, MAX_SHOWN);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${unread} unread`} />}
      >
        <Bell aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-medium text-accent-foreground md:top-0 md:right-0">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications{unread > 0 && <span className="ml-1 font-normal text-muted-foreground">· {unread} unread</span>}</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAll(persona.user.id)}
              className="flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs text-accent-strong hover:underline"
            >
              <CheckCheck className="size-3.5" aria-hidden="true" />
              Mark all read
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
            <BellOff className="size-5" aria-hidden="true" />
            You are all caught up.
          </div>
        ) : (
          <ul className="max-h-[min(24rem,70vh)] divide-y overflow-y-auto">
            {shown.map((n) => (
              <li key={n.id}>
                <DropdownMenuItem
                  className={cn("flex min-h-14 items-start gap-2.5 rounded-none px-3 py-2.5", !n.readAt && "bg-accent-subtle/50")}
                  onClick={() => {
                    markRead(n.id);
                    router.push(n.href);
                  }}
                >
                  <span
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent ring-1 ring-accent-strong")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                    <span className="tabular mt-1 block text-xs text-muted-foreground">
                      {!n.readAt && <span className="sr-only">Unread. </span>}
                      {formatDateTime(n.createdAt)}
                    </span>
                  </span>
                </DropdownMenuItem>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
