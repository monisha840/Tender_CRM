import type { Metadata } from "next";
import { decodeRouteId } from "@/lib/data/links";
import { Detail } from "./detail";

export const metadata: Metadata = { title: "Project" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Detail id={decodeRouteId(id)} />;
}
