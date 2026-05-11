import { buildNotificationPreview, listNotificationFlowSettings } from "@/lib/notifications/flow";
import { getSystemReadinessSnapshot } from "@/lib/system-readiness";
import { connectMongo } from "@/lib/db/mongo";
import { NotificationDeliveryLog } from "@/models/NotificationDeliveryLog";
import { NotificationsClient } from "./NotificationsClient";

export default async function NotificationFlowPage() {
  const flows = await listNotificationFlowSettings();
  await connectMongo();
  const recentFailures = await NotificationDeliveryLog.find({ status: "failed" })
    .sort({ sentAt: -1 })
    .limit(8)
    .lean();
  const readiness = getSystemReadinessSnapshot();
  return (
    <NotificationsClient
      flows={flows}
      readiness={readiness}
      previews={Object.fromEntries(
        flows.map((flow) => [flow.formSlug, buildNotificationPreview(flow.formSlug, flow.formName)]),
      )}
      recentFailures={recentFailures.map((item) => ({
        id: String(item._id),
        formName: item.formName || item.formSlug || "Unknown form",
        formSlug: item.formSlug || "",
        recipient: item.recipient || "",
        subject: item.subject || "",
        error: item.error || "",
        sentAt: item.sentAt ? new Date(item.sentAt).toISOString() : "",
      }))}
    />
  );
}
