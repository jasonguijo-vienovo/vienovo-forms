import { AdminJob, type AdminJobType } from "@/models/AdminJob";

function now() {
  return new Date();
}

export async function startAdminJob(input: {
  type: AdminJobType;
  actorEmail: string;
  targetType?: string;
  targetId?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}) {
  return AdminJob.create({
    type: input.type,
    status: "running",
    actorEmail: input.actorEmail,
    targetType: input.targetType ?? "",
    targetId: input.targetId ?? "",
    summary: input.summary ?? "",
    metadata: input.metadata ?? {},
    startedAt: now(),
    lastHeartbeatAt: now(),
  });
}

export async function queueAdminJob(input: {
  type: AdminJobType;
  actorEmail: string;
  targetType?: string;
  targetId?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}) {
  return AdminJob.create({
    type: input.type,
    status: "queued",
    actorEmail: input.actorEmail,
    targetType: input.targetType ?? "",
    targetId: input.targetId ?? "",
    summary: input.summary ?? "",
    metadata: input.metadata ?? {},
    queuedAt: now(),
  });
}

export async function markAdminJobRunning(jobId: string) {
  await AdminJob.updateOne(
    { _id: jobId },
    {
      $set: {
        status: "running",
        startedAt: now(),
        lastHeartbeatAt: now(),
        errorMessage: "",
      },
    },
  );
}

export async function heartbeatAdminJob(jobId: string) {
  await AdminJob.updateOne({ _id: jobId }, { $set: { lastHeartbeatAt: now() } });
}

export async function completeAdminJob(
  jobId: string,
  input: { summary?: string; metadata?: Record<string, unknown> },
) {
  const finishedAt = now();
  const existing = await AdminJob.findById(jobId).select({ startedAt: 1 }).lean();
  const startedAt = existing?.startedAt ? new Date(existing.startedAt) : finishedAt;
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

  await AdminJob.updateOne(
    { _id: jobId },
    {
      $set: {
        status: "succeeded",
        summary: input.summary ?? "",
        metadata: input.metadata ?? {},
        finishedAt,
        durationMs,
        errorMessage: "",
      },
    },
  );
}

export async function failAdminJob(
  jobId: string,
  input: { summary?: string; errorMessage: string; metadata?: Record<string, unknown> },
) {
  const finishedAt = now();
  const existing = await AdminJob.findById(jobId).select({ startedAt: 1 }).lean();
  const startedAt = existing?.startedAt ? new Date(existing.startedAt) : finishedAt;
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

  await AdminJob.updateOne(
    { _id: jobId },
    {
      $set: {
        status: "failed",
        summary: input.summary ?? "",
        metadata: input.metadata ?? {},
        errorMessage: input.errorMessage,
        finishedAt,
        durationMs,
      },
    },
  );
}
