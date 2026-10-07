import { cn } from "@/lib/utils";

/** Wordmark: a plain navy square monogram plus name. No imagery. */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-foreground" aria-hidden="true">
        T
      </span>
      <span className={cn("text-sm font-semibold tracking-tight", compact && "sr-only")}>Tender CRM</span>
    </div>
  );
}
