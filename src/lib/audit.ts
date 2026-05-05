import { AuditLog } from "@/models/AuditLog";

export async function writeAuditLog(input: {
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await AuditLog.create({
      actorEmail: input.actorEmail,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? "",
      details: input.details ?? {},
    });
  } catch (error) {
    console.error("writeAuditLog failed:", error);
  }
}

