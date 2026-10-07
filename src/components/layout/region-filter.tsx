"use client";

import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALL_REGIONS } from "@/lib/data/shared";
import { useRegionFilter } from "@/store/hooks";

/** Region filter applied to every dashboard widget and list. Remembered between visits. */
export function RegionFilterControl() {
  const { region, setRegion, options } = useRegionFilter();
  const current = options.find((r) => r.id === region)?.name ?? "All regions";

  // A single-region user has nothing to choose: show their region as a label.
  if (options.length <= 1) {
    return (
      <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:inline-flex">
        <MapPin className="size-4" aria-hidden="true" />
        {options[0]?.name ?? "—"}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="h-11 gap-1.5 px-2.5 md:h-9" aria-label={`Region filter: ${current}`} />}>
        <MapPin aria-hidden="true" />
        <span className="max-w-28 truncate text-sm">{current}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Region</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={region} onValueChange={(v) => setRegion(v)}>
            <DropdownMenuRadioItem value={ALL_REGIONS} className="min-h-11 md:min-h-8">
              All regions
            </DropdownMenuRadioItem>
            {options.map((r) => (
              <DropdownMenuRadioItem key={r.id} value={r.id} className="min-h-11 md:min-h-8">
                {r.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
