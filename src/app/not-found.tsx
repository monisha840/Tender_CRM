import Link from "next/link";
import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border bg-surface px-6 py-12 text-center">
      <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">This address does not match anything in the tool. The record may have been removed, or the link may be mistyped.</p>
      <Button nativeButton={false} render={<Link href="/dashboard" />} className="mt-2 min-h-11 md:min-h-8">
        Go to dashboard
      </Button>
    </div>
  );
}
