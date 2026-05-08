import { connectMongo } from "@/lib/db/mongo";
import { RequestModel, type FormType } from "@/models/Request";

const REF_PREFIX = "SLA - ";
const REF_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const REF_LENGTH = 6;
const MAX_TRIES = 12;

export async function generateReferenceNo(formType: FormType): Promise<string> {
  await connectMongo();
  void formType;

  for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
    const token = randomToken(REF_LENGTH);
    const referenceNo = `${REF_PREFIX}${token}`;
    const exists = await RequestModel.exists({ referenceNo });
    if (!exists) return referenceNo;
  }

  throw new Error("Failed to generate a unique reference number.");
}

function randomToken(length: number) {
  let value = "";
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * REF_POOL.length);
    value += REF_POOL[index];
  }
  return value;
}
