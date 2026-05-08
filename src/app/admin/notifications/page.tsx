import { listNotificationFlowSettings } from "@/lib/notifications/flow";
import { getSystemReadinessSnapshot } from "@/lib/system-readiness";
import { NotificationsClient } from "./NotificationsClient";

export default async function NotificationFlowPage() {
  const flows = await listNotificationFlowSettings();
  const readiness = getSystemReadinessSnapshot();
  return <NotificationsClient flows={flows} readiness={readiness} />;
}
