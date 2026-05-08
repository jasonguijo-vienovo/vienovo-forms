import { createHash } from "node:crypto";
import { parseImportedFormHtml, parseSpreadsheetBindings } from "@/lib/imported-forms";
import type { FormImportReadinessState } from "@/models/FormImport";

export type ImportDiagnosticsInput = {
  name: string;
  slug: string;
  htmlSource: string;
  appsScriptSource: string;
  externalFormUrl?: string;
  spreadsheetBindings?: unknown;
  writeResponsesToSheet?: boolean;
  responseSheetName?: string;
  spreadsheetId?: string;
  defaultResponseSpreadsheetId?: string;
};

export type ImportDiagnosticsResult = {
  summary: {
    inputCount: number;
    selectCount: number;
    textareaCount: number;
    scriptFunctionCount: number;
  };
  sourceChecksum: string;
  readinessState: FormImportReadinessState;
  parseDiagnostics: {
    parsedTitle: string;
    parsedDescription: string;
    parsedFieldCount: number;
    fieldNames: string[];
    missingBindings: string[];
    warnings: string[];
    blockers: string[];
    warningCount: number;
    blockerCount: number;
  };
  bindings: Record<string, string>;
};

function matchCount(source: string, regex: RegExp) {
  return source.match(regex)?.length ?? 0;
}

export function summarizeImportedSource(htmlSource: string, appsScriptSource: string) {
  const html = htmlSource || "";
  const gs = appsScriptSource || "";

  return {
    inputCount: matchCount(html, /<input\b/gi),
    selectCount: matchCount(html, /<select\b/gi),
    textareaCount: matchCount(html, /<textarea\b/gi),
    scriptFunctionCount: matchCount(gs, /\bfunction\s+[A-Za-z0-9_]+\s*\(/g),
  };
}

export function analyzeImportedSource(input: ImportDiagnosticsInput): ImportDiagnosticsResult {
  const htmlSource = input.htmlSource?.trim() ?? "";
  const appsScriptSource = input.appsScriptSource?.trim() ?? "";
  const externalFormUrl = String(input.externalFormUrl ?? "").trim();
  const bindings = parseSpreadsheetBindings(input.spreadsheetBindings);
  const runtime = parseImportedFormHtml(htmlSource);
  const warnings = [...runtime.warnings];
  const blockers: string[] = [];
  const hasExternalFormUrl = Boolean(externalFormUrl);

  if (!input.slug.trim()) {
    blockers.push("A form ID is required.");
  }
  if (!htmlSource && !hasExternalFormUrl) {
    blockers.push("HTML source is required.");
  }
  if (!appsScriptSource && !hasExternalFormUrl) {
    blockers.push("Apps Script source is required.");
  }
  if (runtime.fields.length === 0 && !hasExternalFormUrl) {
    blockers.push("No supported fields were detected in the imported HTML.");
  }

  const bindingCandidates = runtime.fields.filter((field) =>
    ["select", "radio", "checkbox-group"].includes(field.type),
  );
  const missingBindings = bindingCandidates
    .filter((field) => !field.options?.length)
    .filter((field) => !bindings[field.name] && !bindings[field.name.toLowerCase().replace(/[^a-z0-9]+/g, "")])
    .map((field) => field.name);

  if (missingBindings.length > 0 && !String(input.spreadsheetId ?? "").trim()) {
    blockers.push(
      `Dropdown-like fields need spreadsheet data but no spreadsheet ID was provided: ${missingBindings.join(", ")}`,
    );
  }

  const responseSpreadsheetId =
    String(input.defaultResponseSpreadsheetId ?? "").trim() || String(input.spreadsheetId ?? "").trim();
  if (input.writeResponsesToSheet && !responseSpreadsheetId) {
    blockers.push("Sheet response copy is enabled but no response spreadsheet is configured.");
  }
  if (input.writeResponsesToSheet && !String(input.responseSheetName ?? "").trim()) {
    warnings.push("Sheet response copy is enabled without a custom response sheet name.");
  }
  if (hasExternalFormUrl && !htmlSource && !appsScriptSource) {
    warnings.push("This import will launch an external form URL instead of the in-app runtime.");
  }

  const readinessState: FormImportReadinessState =
    blockers.length > 0 ? "blocked" : warnings.length > 0 ? "needs-review" : "ready";
  const sourceChecksum = createHash("sha256")
    .update(`${input.slug}\n${externalFormUrl}\n${htmlSource}\n${appsScriptSource}`)
    .digest("hex");

  return {
    summary: summarizeImportedSource(htmlSource, appsScriptSource),
    sourceChecksum,
    readinessState,
    parseDiagnostics: {
      parsedTitle: runtime.title,
      parsedDescription: runtime.description,
      parsedFieldCount: runtime.fields.length,
      fieldNames: runtime.fields.map((field) => field.name),
      missingBindings,
      warnings,
      blockers,
      warningCount: warnings.length,
      blockerCount: blockers.length,
    },
    bindings,
  };
}
