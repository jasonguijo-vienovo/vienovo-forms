export type AppsScriptTriggerHints = {
  detectedFunctions: string[];
  detectedEvents: string[];
};

type ImportedTriggerInvocationInput = {
  form: {
    slug: string;
    name: string;
    triggerEnabled?: boolean;
    triggerUrl?: string;
    triggerSource?: string;
    triggerEvent?: string;
    triggerFunctionName?: string;
  };
  request: {
    id: string;
    referenceNo: string;
  };
  submittedBy: {
    email: string;
    name: string;
  };
  values: Record<string, unknown>;
  labels: Record<string, string>;
};

export type ImportedTriggerInvocationResult =
  | { attempted: false; reason: "disabled" | "missing-url" }
  | { attempted: true; ok: true; status: number }
  | { attempted: true; ok: false; error: string };

const KNOWN_TRIGGER_FUNCTIONS = new Set([
  "doGet",
  "doPost",
  "onEdit",
  "onOpen",
  "onInstall",
  "onSubmit",
  "onFormSubmit",
]);

const EVENT_LABELS: Record<string, string> = {
  doGet: "web-get",
  doPost: "web-post",
  onEdit: "edit",
  onOpen: "open",
  onInstall: "install",
  onSubmit: "submit",
  onFormSubmit: "form-submit",
  onChange: "change",
  onCalendarUpdate: "calendar-update",
  timeBased: "time-driven",
};

function uniqueSorted(values: Iterable<string>) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function abbreviate(text: string, max = 140) {
  const value = text.trim().replace(/\s+/g, " ");
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function normalizeTriggerUrl(input: string) {
  const value = String(input || "").trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Trigger URL must start with http:// or https://");
    }
    return parsed.toString();
  } catch {
    throw new Error("Trigger URL must be a valid http:// or https:// link.");
  }
}

export function detectAppsScriptTriggerHints(source: string): AppsScriptTriggerHints {
  const text = String(source || "");
  if (!text.trim()) {
    return { detectedFunctions: [], detectedEvents: [] };
  }

  const detectedFunctions = new Set<string>();
  const detectedEvents = new Set<string>();

  for (const match of text.matchAll(/\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) {
    const fn = String(match[1] || "").trim();
    if (!fn) continue;
    if (KNOWN_TRIGGER_FUNCTIONS.has(fn) || /^on[A-Z]/.test(fn)) {
      detectedFunctions.add(fn);
      const mapped = EVENT_LABELS[fn];
      if (mapped) detectedEvents.add(mapped);
    }
  }

  for (const match of text.matchAll(/ScriptApp\.newTrigger\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
    const fn = String(match[1] || "").trim();
    if (fn) detectedFunctions.add(fn);
  }

  for (const match of text.matchAll(/\.(onFormSubmit|onEdit|onOpen|onChange|onInstall|onCalendarUpdate|timeBased)\s*\(/g)) {
    const eventKey = String(match[1] || "").trim();
    const mapped = EVENT_LABELS[eventKey];
    if (mapped) detectedEvents.add(mapped);
  }

  return {
    detectedFunctions: uniqueSorted(detectedFunctions),
    detectedEvents: uniqueSorted(detectedEvents),
  };
}

export async function fireImportedFormTrigger(
  input: ImportedTriggerInvocationInput,
): Promise<ImportedTriggerInvocationResult> {
  if (!input.form.triggerEnabled) {
    return { attempted: false, reason: "disabled" };
  }

  const triggerUrl = normalizeTriggerUrl(input.form.triggerUrl || "");
  if (!triggerUrl) {
    return { attempted: false, reason: "missing-url" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vienovo-trigger-event": String(input.form.triggerEvent || "submitted").trim() || "submitted",
      },
      body: JSON.stringify({
        event: String(input.form.triggerEvent || "submitted").trim() || "submitted",
        triggerSource: String(input.form.triggerSource || "").trim(),
        triggerFunctionName: String(input.form.triggerFunctionName || "").trim(),
        triggeredAt: new Date().toISOString(),
        form: {
          slug: input.form.slug,
          name: input.form.name,
        },
        request: {
          id: input.request.id,
          referenceNo: input.request.referenceNo,
        },
        submittedBy: input.submittedBy,
        fieldLabels: input.labels,
        values: input.values,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        attempted: true,
        ok: false,
        error: `Trigger endpoint returned ${response.status}${body ? `: ${abbreviate(body)}` : ""}`,
      };
    }

    return {
      attempted: true,
      ok: true,
      status: response.status,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : "Trigger request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
