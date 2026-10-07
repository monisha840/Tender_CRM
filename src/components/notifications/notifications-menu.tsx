"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CalendarClock, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DeadlineBadge } from "@/components/shared/status-badge";
import { canView, entityHref, getPendingApprovalsFor, getUpcomingTenderDeadlines } from "@/lib/data";
import { useAsOfDb } from "@/components/layout/use-as-of-db";
import { useCurrentPersona } from "@/store/hooks";

const MAX_SHOWN = 8;
/** Bids closing within this many days (or already overdue and still open) appear in the bell. */
const HORIZON_DAYS = 7;

interface Item {
  id: string;
  title: string;
  meta: string;
  href: string;
  deadline?: string;
  kind: "deadline" | "approval";
}

/**
 * Bell in the top bar. Nothing is stored: the list is computed on every read from the tender deadlines closing soon
 * and the approvals waiting for this user, so there is no read/unread state to keep.
 */
export function NotificationsMenu() {
  const router = useRouter();
  const db = useAsOfDb();
  const persona = useCurrentPersona();
  const userId = persona.user.id;

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (canView(db, userId, "tenders")) {
      getUpcomingTenderDeadlines(db, "ALL", HORIZON_DAYS).rows.forEach((r) =>
        out.push({
          id: `t-${r.tender.id}`,
          kind: "deadline",
          title: r.tender.title,
          meta: `Bid closes · ${r.organisationName} · ${r.stage.name}`,
          href: entityHref("TENDER", r.tender.id),
          deadline: r.tender.submissionDeadlineAt,
        }),
      );
    }
    if (canView(db, userId, "approvals")) {
      getPendingApprovalsFor(db, userId).forEach((a) =>
        out.push({ id: `a-${a.request.id}`, kind: "approval", title: a.request.title, meta: `Needs your decision · ${a.typeLabel}`, href: "/approvals", deadline: a.dueAt ?? undefined }),
      );
    }
    return out;
  }, [db, userId]);
  const shown = items.slice(0, MAX_SHOWN);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${items.length} item${items.length === 1 ? "" : "s"}`} data-testid="notifications-bell" />}
      >
        <Bell aria-hidden="true" />
        {items.length > 0 && (
          <span
            data-testid="notifications-count"
            className="absolute top-1 right-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-medium text-accent-foreground md:top-0 md:right-0"
          >
            {items.length > 99 ? "99+" : items.length}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="border-b px-3 py-2">
          <span className="text-sm font-semibold">Needs your attention{items.length > 0 && <span className="ml-1 font-normal text-muted-foreground">· {items.length}</span>}</span>
        </div>
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
            <BellOff className="size-5" aria-hidden="true" />
            You are all caught up.
          </div>
        ) : (
          <ul className="max-h-[min(24rem,70vh)] divide-y overflow-y-auto">
            {shown.map((n) => {
              const Icon = n.kind === "deadline" ? CalendarClock : CheckSquare;
              return (
                <li key={n.id}>
                  <DropdownMenuItem className="flex min-h-14 items-start gap-2.5 rounded-none px-3 py-2.5" onClick={() => router.push(n.href)}>
                    <Icon className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-sm font-medium">{n.title}</span>
                      <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{n.meta}</span>
                    </span>
                    {n.deadline && <DeadlineBadge value={n.deadline} />}
                  </DropdownMenuItem>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
