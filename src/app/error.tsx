"use client";

import Link from "next/link";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A screen failed to render. The rest of the app (sidebar, header) stays usable, and the user can retry or leave. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border bg-surface px-6 py-12 text-center">
      <TriangleAlert className="size-6 text-status-danger" aria-hidden="true" />
      <h1 className="text-lg font-semibold">This screen could not load</h1>
      <p className="text-sm text-muted-foreground">Something went wrong while showing this page. Your saved data is safe. Try again, or go back to the dashboard.</p>
      {error.digest && <p className="tabular text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <div className="mt-2 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button onClick={reset} className="min-h-11 md:min-h-8">
          Try again
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard" />} className="min-h-11 md:min-h-8">
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
