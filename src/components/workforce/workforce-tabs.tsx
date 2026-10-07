"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/employees", label: "Employees", match: (p: string) => p === "/employees" || /^\/employees\/(?!attendance|payroll)[^/]+$/.test(p) },
  { href: "/employees/attendance", label: "Attendance", match: (p: string) => p.startsWith("/employees/attendance") },
  { href: "/employees/payroll", label: "Payroll", match: (p: string) => p === "/employees/payroll" },
  { href: "/employees/payroll/dashboard", label: "Payroll dashboard", match: (p: string) => p.startsWith("/employees/payroll/dashboard") },
];

/** Sub-navigation for the Employees module. Scrolls sideways on a phone rather than wrapping. */
export function WorkforceTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Employees sections" className="-mx-4 mb-5 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap md:min-h-10",
                  active ? "border-accent font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
