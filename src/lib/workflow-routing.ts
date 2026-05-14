import { Approver } from "@/models/Approver";

type ProcessorCapableForm = {
  processorApproverId?: string;
  processorApproverEmail?: string;
};

type ConfiguredApproverTarget = {
  approverId?: string;
  approverEmail?: string;
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

export function humanizeWorkflowRole(role: string | null | undefined) {
  const key = normalizeKey(String(role ?? ""));
  if (!key) return "";
  if (key === "processor") return "Processor";
  if (key === "supervisor") return "Immediate Superior";
  if (key === "head") return "Department Head";
  if (key === "level1") return "Level 1 Approver";
  if (key === "level2") return "Level 2 Approver";
  if (key === "ceo") return "CEO";
  if (key === "finance") return "Finance";
  if (key === "hr") return "HR";

  return String(role ?? "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildPendingStepNotificationCopy(input: {
  formName: string;
  referenceNo: string;
  role: string;
}) {
  const roleLabel = humanizeWorkflowRole(input.role);
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
    summary: roleLabel
      ? `A ${input.formName} request is waiting for ${roleLabel.toLowerCase()} approval.`
      : `A ${input.formName} request is waiting for your approval.`,
    text: roleLabel
      ? `A ${input.formName} request is waiting for ${roleLabel.toLowerCase()} approval.\n\n`
      : `A ${input.formName} request is waiting for your approval.\n\n`,
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

export async function resolveConfiguredApprover(
  input: ConfiguredApproverTarget & { label: string },
) {
  const configuredId = String(input.approverId ?? "").trim();
  const configuredEmail = normalizeEmail(String(input.approverEmail ?? ""));
  if (!configuredId && !configuredEmail) return null;

  const configured =
    (configuredId ? await Approver.findById(configuredId).lean() : null) ??
    (configuredEmail ? await Approver.findOne({ email: configuredEmail }).lean() : null);

  if (!configured) {
    throw new Error(`${input.label} is invalid. Update the form settings.`);
  }
  if (!configured.isActive) {
    throw new Error(`${input.label} is inactive. Update the form settings.`);
  }
  if (!String(configured.email ?? "").trim()) {
    throw new Error(`${input.label} has no email address.`);
  }

  return configured;
}

export async function resolveDefaultCeoApprover() {
  const ceo = await Approver.findOne({ roles: "ceo", isActive: true }).lean();
  if (!ceo) {
    throw new Error("No active CEO approver is configured. Assign the CEO role on the Approvers page.");
  }
  if (!String(ceo.email ?? "").trim()) {
    throw new Error("The CEO approver is missing an email address.");
  }
  return ceo;
}
