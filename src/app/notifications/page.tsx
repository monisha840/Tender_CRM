import type { Metadata } from "next";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";

export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return <NotificationsPanel />;
}
