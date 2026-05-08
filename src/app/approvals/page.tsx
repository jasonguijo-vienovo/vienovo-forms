import { Navbar } from "@/components/navbar";
import { getApprovalQueueData } from "@/lib/approval-queue";
import { requireApprovalsAccess } from "@/lib/approval-access";
import { ApprovalsClient } from "./ApprovalsClient";

export default async function ApprovalsPage() {
  const { email } = await requireApprovalsAccess();
  const data = await getApprovalQueueData(email);

  return (
    <>
      <Navbar />
      <ApprovalsClient data={data} />
    </>
  );
}
