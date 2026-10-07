"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface HeaderAction {
  label: string;
  icon?: LucideIcon;
  href?: string;
  onClick?: () => void;
  testId?: string;
}

interface PageHeaderProps {
  title: string;
  /** Key status of the record, as a <StatusBadge />. */
  status?: ReactNode;
  description?: string;
  /** The one obvious primary action, shown at the right. */
  primaryAction?: HeaderAction;
  /** Everything else lives in the "more" menu. */
  secondaryActions?: HeaderAction[];
}

/** Title, key status badge, primary action on the right, secondary actions in a menu. */
export function PageHeader({ title, status, description, primaryAction, secondaryActions }: PageHeaderProps) {
  const PrimaryIcon = primaryAction?.icon;
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {status}
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {(primaryAction || secondaryActions?.length) && (
        <div className="flex shrink-0 items-center gap-2">
          {primaryAction &&
            (primaryAction.href ? (
              <Button className="flex-1 sm:flex-none" nativeButton={false} render={<Link href={primaryAction.href} />}>
                {PrimaryIcon && <PrimaryIcon data-icon="inline-start" aria-hidden="true" />}
                {primaryAction.label}
              </Button>
            ) : (
              <Button className="flex-1 sm:flex-none" onClick={primaryAction.onClick} data-testid={primaryAction.testId}>
                {PrimaryIcon && <PrimaryIcon data-icon="inline-start" aria-hidden="true" />}
                {primaryAction.label}
              </Button>
            ))}
          {secondaryActions && secondaryActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
                <MoreHorizontal aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {secondaryActions.map((a) => {
                  const Icon = a.icon;
                  return (
                    <DropdownMenuItem
                      key={a.label}
                      className="min-h-11 md:min-h-8"
                      onClick={a.onClick}
                      data-testid={a.testId}
                      render={a.href ? <Link href={a.href} /> : undefined}
                    >
                      {Icon && <Icon aria-hidden="true" />}
                      {a.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </header>
  );
}
