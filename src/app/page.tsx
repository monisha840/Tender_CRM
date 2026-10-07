"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentPersona, useHydrated } from "@/store/hooks";

/** There is no landing page: send each persona to their role's home (Director → Dashboard, site roles → Sites / Work). */
export default function RootPage() {
  const router = useRouter();
  const persona = useCurrentPersona();
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated) router.replace(persona.role.homePath);
  }, [hydrated, persona.role.homePath, router]);

  return <Skeleton className="h-8 w-56" aria-label="Loading" />;
}
