import { AuditLog } from "@/models/AuditLog";

export async function writeAuditLog(input: {
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  correlationId?: string;
  outcome?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  context?: Record<string, unknown>;
  details?: Record<string, unknown>;
}) {
  try {
    await AuditLog.create({
      actorEmail: input.actorEmail,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? "",
      correlationId: input.correlationId ?? "",
      outcome: input.outcome ?? "success",
      before: input.before ?? null,
      after: input.after ?? null,
      context: input.context ?? {},
      details: input.details ?? {},
    });
  } catch (error) {
    console.error("writeAuditLog failed:", error);
  }
}

