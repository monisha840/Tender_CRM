import type { Metadata } from "next";
import { Home } from "@/components/dashboard/home";

export const metadata: Metadata = { title: "Home" };

export default function Page() {
  return <Home />;
}
