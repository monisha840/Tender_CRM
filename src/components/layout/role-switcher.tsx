"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listPersonas } from "@/lib/data/access";
import { useCurrentPersona, useDb } from "@/store/hooks";
import { useDataStore } from "@/store/data-store";
import { useSessionStore } from "@/store/session-store";

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

/** Stands in for login: pick who you are and the whole app (nav, scope, attention list) follows. */
export function RoleSwitcher() {
  const router = useRouter();
  const db = useDb();
  const persona = useCurrentPersona();
  const switchUser = useSessionStore((s) => s.switchUser);
  const resetDemoData = useDataStore((s) => s.resetDemoData);
  const personas = useMemo(() => listPersonas(db), [db]);

  const onSwitch = (userId: string) => {
    const next = personas.find((p) => p.user.id === userId);
    if (!next) return;
    switchUser(userId);
    router.push(next.role.homePath);
    toast.success(`Viewing as ${next.user.name}`, { description: next.role.name });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="h-11 gap-2 px-2 md:h-9" aria-label={`Switch role. Current: ${persona.user.name}, ${persona.role.name}`} />
        }
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent" aria-hidden="true">
          {initials(persona.user.name)}
        </span>
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block max-w-36 truncate text-xs font-medium">{persona.user.name}</span>
          <span className="block max-w-36 truncate text-[11px] font-normal text-muted-foreground">{persona.role.name}</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Demo role (no login in this MVP)</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={persona.user.id} onValueChange={onSwitch}>
            {personas.map((p) => (
              <DropdownMenuRadioItem key={p.user.id} value={p.user.id} className="min-h-11 md:min-h-8">
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm">{p.user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {p.role.name}
                    {p.regionIds.length === 1 ? ` · ${db.regions.find((r) => r.id === p.regionIds[0])?.name}` : ""}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11 md:min-h-8"
          onClick={() => {
            if (window.confirm("Reset all demo data to the original seed? Local changes will be lost.")) {
              resetDemoData();
              toast.success("Demo data reset");
            }
          }}
        >
          <RotateCcw aria-hidden="true" />
          Reset demo data
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
