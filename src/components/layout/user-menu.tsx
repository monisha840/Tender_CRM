"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthUser } from "@/components/auth/session-provider";
import { logoutAction } from "@/lib/auth/actions";

const initials = (name: string) =>
  name
    .split(" ")
    .filter((p) => p && !/^dr\.?$/i.test(p))
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Signed-in user (name + role) with a sign-out action. */
export function UserMenu() {
  const user = useAuthUser();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" className="h-11 gap-2 px-2 md:h-9" aria-label={`Account menu: ${user.name}, ${user.roleLabel}`} />}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold text-accent-strong" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="hidden min-w-0 text-left leading-tight lg:block">
          <span className="block max-w-36 truncate text-xs font-medium">{user.name}</span>
          <span className="block max-w-36 truncate text-[11px] font-normal text-muted-foreground">{user.roleLabel}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col leading-tight">
            <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
            <span className="truncate text-xs font-normal">{user.email}</span>
            <span className="truncate text-xs font-normal">{user.roleLabel}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem render={<button type="submit" className="w-full" />} className="min-h-11 md:min-h-8">
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
