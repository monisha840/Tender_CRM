import { notFound } from "next/navigation";
import { PHASE67_ENABLED } from "@/lib/features";

/** Employees and payroll are hidden until PHASE67_ENABLED (src/lib/features.ts). */
export default function EmployeesLayout({ children }: { children: React.ReactNode }) {
  if (!PHASE67_ENABLED) notFound();
  return children;
}
