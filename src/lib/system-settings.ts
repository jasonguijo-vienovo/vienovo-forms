import { connectMongo } from "@/lib/db/mongo";
import { SystemSetting } from "@/models/SystemSetting";

const IMPORTED_DROPDOWN_SOURCE_SHEETS_KEY = "imported-dropdown-source-sheets";
const DEFAULT_IMPORTED_DROPDOWN_SOURCE_SHEETS = ["Form Dropdowns", "Dropdowns"] as const;

function normalizeSheetName(input: string) {
  return String(input || "").trim().replace(/\s+/g, " ");
}

export function parseSheetNameList(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/g)
        .map(normalizeSheetName)
        .filter(Boolean),
    ),
  );
}

export function normalizeSheetNameList(values: unknown) {
  if (Array.isArray(values)) {
    return Array.from(
      new Set(
        values
          .map((value) => normalizeSheetName(String(value ?? "")))
          .filter(Boolean),
      ),
    );
  }
  return [];
}

export async function getImportedDropdownSourceSheetNames() {
  await connectMongo();
  const doc = await SystemSetting.findOne({ key: IMPORTED_DROPDOWN_SOURCE_SHEETS_KEY }).lean();
  const configured = normalizeSheetNameList(doc?.value);
  return configured.length > 0 ? configured : [...DEFAULT_IMPORTED_DROPDOWN_SOURCE_SHEETS];
}

export async function saveImportedDropdownSourceSheetNames(sheetNames: string[]) {
  await connectMongo();
  const normalized = normalizeSheetNameList(sheetNames);
  const nextValue =
    normalized.length > 0 ? normalized : [...DEFAULT_IMPORTED_DROPDOWN_SOURCE_SHEETS];

  await SystemSetting.updateOne(
    { key: IMPORTED_DROPDOWN_SOURCE_SHEETS_KEY },
    {
      $set: {
        key: IMPORTED_DROPDOWN_SOURCE_SHEETS_KEY,
        value: nextValue,
      },
    },
    { upsert: true },
  );

  return nextValue;
}
