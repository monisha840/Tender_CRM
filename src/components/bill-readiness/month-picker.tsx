"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

/** Month selector that navigates to `<basePath>?month=YYYY-MM`. */
export function MonthPicker({ basePath, month }: { basePath: string; month: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Month</span>
      <Input
        type="month"
        value={month}
        aria-label="Billing month"
        data-testid="br-month"
        className="w-40"
        onChange={(e) => e.target.value && router.push(`${basePath}?month=${e.target.value}`)}
      />
    </label>
  );
}
