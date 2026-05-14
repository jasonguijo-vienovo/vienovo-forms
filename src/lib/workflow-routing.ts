import { Approver } from "@/models/Approver";

type ProcessorCapableForm = {
  processorApproverId?: string;
  processorApproverEmail?: string;
};

function normalizeKey(input: string) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeEmail(input: string) {
  return String(input ?? "").trim().toLowerCase();
}

export function isProcessorRole(role: string | null | undefined) {
  return normalizeKey(String(role ?? "")) === "processor";
}

export function buildPendingStepNotificationCopy(input: {
  formName: string;
  referenceNo: string;
  role: string;
}) {
  if (isProcessorRole(input.role)) {
    return {
      subject: `${input.formName} request needs processing (${input.referenceNo})`,
      summary: `A ${input.formName} request is ready for processing.`,
      text: `A ${input.formName} request is ready for processing.\n\n`,
      ctaLabel: "Open processing page",
      statusLabel: "Pending processing",
    };
  }

  return {
    subject: `${input.formName} request needs your approval (${input.referenceNo})`,
    summary: `A ${input.formName} request is waiting for your approval.`,
    text: `A ${input.formName} request is waiting for your approval.\n\n`,
    ctaLabel: "Open approval page",
    statusLabel: "Pending approval",
  };
}

export async function resolveAssignedProcessor(input: {
  definition?: ProcessorCapableForm | null;
  existingProcessorEmail?: string | null;
}) {
  const configuredId = String(input.definition?.processorApproverId ?? "").trim();
  const configuredEmail = normalizeEmail(String(input.definition?.processorApproverEmail ?? ""));

  if (configuredId || configuredEmail) {
    const configured =
      (configuredId ? await Approver.findById(configuredId).lean() : null) ??
      (configuredEmail ? await Approver.findOne({ email: configuredEmail }).lean() : null);

    if (!configured || !configured.roles?.includes("processor")) {
      throw new Error("The assigned processor for this form is invalid. Update the form settings.");
    }
    if (!configured.isActive) {
      throw new Error("The assigned processor for this form is inactive. Update the form settings.");
    }
    if (!String(configured.email ?? "").trim()) {
      throw new Error("The assigned processor for this form has no email address.");
    }

    return configured;
  }

  const existingProcessorEmail = normalizeEmail(String(input.existingProcessorEmail ?? ""));
  if (existingProcessorEmail) {
    const existing = await Approver.findOne({ email: existingProcessorEmail }).lean();
    if (existing?.email) return existing;
  }

  const fallback = await Approver.findOne({ roles: "processor", isActive: true }).lean();
  if (!fallback) {
    throw new Error("No active processor configured. Ask an admin to assign one.");
  }
  return fallback;
}
