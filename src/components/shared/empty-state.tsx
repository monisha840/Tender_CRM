import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** One line: what belongs here. */
  message: string;
  icon?: LucideIcon;
  /** A single clear next step. */
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}

/** Empty states: one line explaining what goes here, plus one action. No illustrations. */
export function EmptyState({ message, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-4 py-10 text-center", className)}>
      {Icon && <Icon className="size-6 text-muted-foreground" aria-hidden="true" />}
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {action &&
        (action.href ? (
          <Button variant="outline" nativeButton={false} render={<Link href={action.href} />}>
            {action.label}
          </Button>
        ) : (
          <Button variant="outline" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}
