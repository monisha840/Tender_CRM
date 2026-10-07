import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { DeadlineList } from "@/components/tenders/deadline-list";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Upcoming tender deadlines" };

export default function Page() {
  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/tenders" />}>
        <ArrowLeft data-icon="inline-start" aria-hidden="true" />
        All tenders
      </Button>
      <PageHeader title="Upcoming deadlines" description="Open tenders closing in the next 30 days. Reminders go out at 7, 3 and 1 day before the deadline." />
      <DeadlineList withinDays={30} />
    </>
  );
}
