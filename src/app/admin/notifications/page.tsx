import { listNotificationFlowSettings } from "@/lib/notifications/flow";
import { NotificationsClient } from "./NotificationsClient";

export default async function NotificationFlowPage() {
  const flows = await listNotificationFlowSettings();
  return <NotificationsClient flows={flows} />;
}
