import { listSpreadsheetSheets, readSpreadsheetMatrix, readSpreadsheetRange } from "@/lib/google/sheets";

export type ImportedFieldOption = {
  value: string;
  label: string;
};

export type ImportedFieldDefinition = {
  name: string;
  label: string;
  type:
    | "text"
    | "email"
    | "number"
    | "date"
    | "time"
    | "tel"
    | "textarea"
    | "select"
    | "radio"
    | "checkbox"
    | "checkbox-group";
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: ImportedFieldOption[];
  rows?: number;
};

export type ImportedFormRuntime = {
  title: string;
  description: string;
  fields: ImportedFieldDefinition[];
  warnings: string[];
  sheetNames: string[];
  spreadsheetBindings: Record<string, string>;
  autoDetectedBindings: Record<string, string>;
  hydratedHtml: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, "/");
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function humanize(input: string) {
  return input
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeKey(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseAttributes(source: string) {
  const attrs: Record<string, string> = {};
  const regex = /([A-Za-z_:][A-Za-z0-9_:\-.]*)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source))) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "true";
    attrs[key] = decodeHtml(value);
  }
  return attrs;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractBodyHtml(htmlSource: string) {
  const headStyles = [...htmlSource.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)]
    .map((match) => match[0])
    .join("\n");
  const body = htmlSource.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  return `${headStyles}\n${body ?? htmlSource}`;
}

function hydrateOriginalHtml(htmlSource: string, fields: ImportedFieldDefinition[]) {
  const fieldsByName = new Map(fields.map((field) => [field.name, field]));
  const bodyHtml = extractBodyHtml(htmlSource)
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/\s+(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, "")
    .replace(/<form\b[^>]*>/gi, "")
    .replace(/<\/form>/gi, "");

  return bodyHtml.replace(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi, (full, attrsSource) => {
    const attrs = parseAttributes(attrsSource ?? "");
    const name = attrs.name || attrs.id;
    const field = name ? fieldsByName.get(name) : null;
    if (!field?.options?.length) return full;

    const requiredOption = field.required ? "" : `<option value="">-- Select --</option>`;
    const options = field.options
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
      )
      .join("");
    return `<select${attrsSource}>${requiredOption}${options}</select>`;
  });
}

export function parseSpreadsheetBindings(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>)
        .map(([key, value]) => [String(key).trim(), String(value ?? "").trim()])
        .filter(([key, value]) => key && value)
    );
  }

  const text = String(raw).trim();
  if (!text) return {};
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(parsed)
      .map(([key, value]) => [String(key).trim(), String(value ?? "").trim()])
      .filter(([key, value]) => key && value)
  );
}

export function parseImportedFormHtml(htmlSource: string): ImportedFormRuntime {
  const warnings: string[] = [];
  const labelsByFor = new Map<string, string>();
  const fields: ImportedFieldDefinition[] = [];
  const radioGroups = new Map<string, ImportedFieldDefinition>();
  const checkboxGroups = new Map<string, ImportedFieldDefinition>();

  for (const match of htmlSource.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
    const attrs = parseAttributes(match[1] ?? "");
    const labelText = stripTags(match[2] ?? "");
    const key = attrs["for"] || attrs["name"] || attrs["id"];
    if (key && labelText) labelsByFor.set(key, labelText);
  }

  const title =
    stripTags(htmlSource.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") ||
    stripTags(htmlSource.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
    "Imported Form";
  const description = stripTags(htmlSource.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");

  const controlRegex = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>|<select\b([^>]*)>([\s\S]*?)<\/select>|<input\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = controlRegex.exec(htmlSource))) {
    if (match[1] != null) {
      const attrs = parseAttributes(match[1]);
      const name = attrs.name || attrs.id;
      if (!name) continue;
      fields.push({
        name,
        label: labelsByFor.get(attrs.id || name) || attrs["aria-label"] || attrs["data-label"] || humanize(name),
        type: "textarea",
        required: attrs.required === "true",
        placeholder: attrs.placeholder || "",
        defaultValue: stripTags(match[2] ?? ""),
        rows: Number(attrs.rows || 4),
      });
      continue;
    }

    if (match[3] != null) {
      const attrs = parseAttributes(match[3]);
      const name = attrs.name || attrs.id;
      if (!name) continue;
      const options: ImportedFieldOption[] = [];
      for (const optionMatch of (match[4] ?? "").matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
        const optionAttrs = parseAttributes(optionMatch[1] ?? "");
        const label = stripTags(optionMatch[2] ?? "") || optionAttrs.value || "Option";
        options.push({ value: optionAttrs.value || label, label });
      }
      fields.push({
        name,
        label: labelsByFor.get(attrs.id || name) || attrs["aria-label"] || attrs["data-label"] || humanize(name),
        type: "select",
        required: attrs.required === "true",
        options,
      });
      continue;
    }

    if (match[5] != null) {
      const attrs = parseAttributes(match[5]);
      const type = (attrs.type || "text").toLowerCase();
      const name = attrs.name || attrs.id;
      if (!name) continue;

      if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
      if (type === "file") {
        warnings.push(`Skipped unsupported file input: ${name}`);
        continue;
      }

      if (type === "radio") {
        const group =
          radioGroups.get(name) ||
          {
            name,
            label: labelsByFor.get(name) || attrs["aria-label"] || attrs["data-label"] || humanize(name),
            type: "radio" as const,
            required: attrs.required === "true",
            options: [],
          };
        group.options?.push({
          value: attrs.value || `${group.options?.length ?? 0}`,
          label: labelsByFor.get(attrs.id || "") || attrs["data-label"] || attrs.value || humanize(name),
        });
        radioGroups.set(name, group);
        if (!fields.find((field) => field.name === name)) fields.push(group);
        continue;
      }

      if (type === "checkbox" && attrs.value && attrs.value !== "on") {
        const group =
          checkboxGroups.get(name) ||
          {
            name,
            label: labelsByFor.get(name) || attrs["aria-label"] || attrs["data-label"] || humanize(name),
            type: "checkbox-group" as const,
            required: attrs.required === "true",
            options: [],
          };
        group.options?.push({
          value: attrs.value,
          label: labelsByFor.get(attrs.id || "") || attrs["data-label"] || attrs.value,
        });
        checkboxGroups.set(name, group);
        if (!fields.find((field) => field.name === name)) fields.push(group);
        continue;
      }

      const safeType = ["text", "email", "number", "date", "time", "tel", "checkbox"].includes(type)
        ? (type as ImportedFieldDefinition["type"])
        : "text";

      fields.push({
        name,
        label: labelsByFor.get(attrs.id || name) || attrs["aria-label"] || attrs["data-label"] || humanize(name),
        type: safeType,
        required: attrs.required === "true",
        placeholder: attrs.placeholder || "",
        defaultValue: attrs.value || "",
      });
    }
  }

  return {
    title,
    description,
    fields,
    warnings,
    sheetNames: [],
    spreadsheetBindings: {},
    autoDetectedBindings: {},
    hydratedHtml: "",
  };
}

function toRange(binding: string) {
  return binding.includes("!") ? binding : `${binding}!A2:A`;
}

function columnLetter(index: number) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function headerMatches(header: string, candidates: string[]) {
  const normalizedHeader = normalizeKey(header);
  if (!normalizedHeader) return false;
  return candidates.some(
    (candidate) =>
      candidate === normalizedHeader ||
      candidate.includes(normalizedHeader) ||
      normalizedHeader.includes(candidate)
  );
}

function findOptionsRangeFromPreview(
  sheetPreviews: Map<string, string[][]>,
  candidates: string[]
) {
  for (const [sheetName, rows] of sheetPreviews.entries()) {
    const maxHeaderRows = Math.min(rows.length, 10);
    for (let rowIndex = 0; rowIndex < maxHeaderRows; rowIndex += 1) {
      const headerRow = rows[rowIndex] ?? [];
      const columnIndex = headerRow.findIndex((header) => headerMatches(header, candidates));
      if (columnIndex >= 0) {
        const column = columnLetter(columnIndex);
        return `${sheetName}!${column}${rowIndex + 2}:${column}`;
      }
    }
  }
  return "";
}

export async function hydrateImportedFormRuntime(opts: {
  htmlSource: string;
  spreadsheetId?: string;
  spreadsheetBindings?: unknown;
}) {
  const runtime = parseImportedFormHtml(opts.htmlSource);
  const spreadsheetId = String(opts.spreadsheetId ?? "").trim();
  const bindings = parseSpreadsheetBindings(opts.spreadsheetBindings);
  runtime.spreadsheetBindings = bindings;
  runtime.hydratedHtml = hydrateOriginalHtml(opts.htmlSource, runtime.fields);

  if (!spreadsheetId) {
    return runtime;
  }

  const warnings = [...runtime.warnings];
  const cache = new Map<string, string[]>();
  const autoDetectedBindings: Record<string, string> = {};
  let sheetNames: string[] = [];
  let sheetPreviews = new Map<string, string[][]>();
  try {
    sheetNames = await listSpreadsheetSheets(spreadsheetId);
    const previewEntries: Array<[string, string[][]]> = await Promise.all(
      sheetNames.map(async (sheet) => [
        sheet,
        await readSpreadsheetMatrix(spreadsheetId, `${sheet}!A1:ZZ100`),
      ] as [string, string[][]])
    );
    sheetPreviews = new Map(previewEntries);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Failed to read spreadsheet metadata.");
  }

  async function getOptions(range: string) {
    if (!cache.has(range)) {
      cache.set(range, await readSpreadsheetRange(spreadsheetId, range));
    }
    return cache.get(range) ?? [];
  }

  for (const field of runtime.fields) {
    if (!["select", "radio", "checkbox-group"].includes(field.type)) continue;

    const explicitRange = bindings[field.name] || bindings[normalizeKey(field.name)];
    let values: string[] = [];

    try {
      if (explicitRange) {
        values = await getOptions(toRange(explicitRange));
      } else {
        const candidates = [field.name, field.label].map(normalizeKey).filter(Boolean);
        let matchedRange = findOptionsRangeFromPreview(sheetPreviews, candidates);

        if (!matchedRange) {
          const matchedSheet = sheetNames.find((sheet) => candidates.includes(normalizeKey(sheet)));
          if (matchedSheet) {
            matchedRange = `${matchedSheet}!A2:A`;
          }
        }

        if (matchedRange) {
          autoDetectedBindings[field.name] = matchedRange;
          values = await getOptions(matchedRange);
        }
      }
    } catch (error) {
      warnings.push(
        `Spreadsheet options failed for ${field.name}: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }

    if (values.length > 0) {
      field.options = values.map((value) => ({ value, label: value }));
    }
  }

  return {
    ...runtime,
    warnings,
    sheetNames,
    spreadsheetBindings: bindings,
    autoDetectedBindings,
    hydratedHtml: hydrateOriginalHtml(opts.htmlSource, runtime.fields),
  };
}
