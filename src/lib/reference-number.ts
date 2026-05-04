import { connectMongo } from "@/lib/db/mongo";
import { RequestModel, type FormType } from "@/models/Request";

const PREFIX: Record<FormType, string> = {
  "travel-booking": "TB",
  "cash-advance": "CA",
  "reimbursement": "RB",
  "request-for-payment": "RFP",
  "cashiering": "CSH",
  imported: "IMP",
};

export async function generateReferenceNo(formType: FormType): Promise<string> {
  await connectMongo();
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const count = await RequestModel.countDocuments({
    formType,
    createdAt: { $gte: dayStart },
  });
  return `${PREFIX[formType]}-${ymd}-${String(count + 1).padStart(4, "0")}`;
}
