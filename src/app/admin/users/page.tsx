import { getAdminEmployeesDirectory } from "@/lib/employee-admin";
import {
  isEmployeeDeviceSyncEnabled,
  isEmployeeDirectorySyncConfigured,
  isEmployeeDirectorySyncEnabled,
} from "@/lib/employee-sync";
import { UserInfosClient } from "./UserInfosClient";

export default async function AdminUsersPage() {
  const employees = await getAdminEmployeesDirectory();

  return (
    <UserInfosClient
      employees={employees}
      graphReady={isEmployeeDirectorySyncConfigured()}
      syncEnabled={isEmployeeDirectorySyncEnabled()}
      deviceSyncEnabled={isEmployeeDeviceSyncEnabled()}
    />
  );
}
