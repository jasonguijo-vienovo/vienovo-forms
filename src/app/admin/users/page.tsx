import { connectMongo } from "@/lib/db/mongo";
import { getAdminEmployeesDirectory } from "@/lib/employee-admin";
import {
  isEmployeeDeviceSyncEnabled,
  isEmployeeDirectorySyncConfigured,
  isEmployeeDirectorySyncEnabled,
} from "@/lib/employee-sync";
import { AdminJob } from "@/models/AdminJob";
import { SyncState } from "@/models/SyncState";
import { UserInfosClient } from "./UserInfosClient";

export default async function AdminUsersPage() {
  const employees = await getAdminEmployeesDirectory();
  await connectMongo();
  const [recentJobs, syncState] = await Promise.all([
    AdminJob.find({ type: "employee-sync" })
      .sort({ startedAt: -1 })
      .limit(6)
      .lean(),
    SyncState.findOne({ key: "employee-graph-users" }).lean(),
  ]);

  return (
    <UserInfosClient
      employees={employees}
      graphReady={isEmployeeDirectorySyncConfigured()}
      syncEnabled={isEmployeeDirectorySyncEnabled()}
      deviceSyncEnabled={isEmployeeDeviceSyncEnabled()}
      recentJobs={recentJobs.map((job) => ({
        id: String(job._id),
        status: job.status,
        actorEmail: job.actorEmail || "",
        summary: job.summary || "",
        errorMessage: job.errorMessage || "",
        startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : "",
        finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : "",
        durationMs: typeof job.durationMs === "number" ? job.durationMs : null,
      }))}
      syncState={{
        lastMode:
          syncState?.lastMode === "delta" || syncState?.lastMode === "full"
            ? syncState.lastMode
            : null,
        lastCompletedAt: syncState?.lastCompletedAt
          ? new Date(syncState.lastCompletedAt).toISOString()
          : "",
        lastErrorAt: syncState?.lastErrorAt ? new Date(syncState.lastErrorAt).toISOString() : "",
        lastErrorMessage: syncState?.lastErrorMessage || "",
      }}
    />
  );
}
