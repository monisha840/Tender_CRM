import Image from "next/image";
import { cn } from "@/lib/utils";

/** Company logo (from sprincehightech.com) plus the product name. */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image src="/brand/logo.png" alt="" width={551} height={453} priority className="h-9 w-auto shrink-0" />
      <span className={cn("text-sm leading-tight font-semibold tracking-tight", compact && "sr-only")}>S. Prince Management Tool</span>
    </div>
  );
}
