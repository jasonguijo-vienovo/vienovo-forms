"use client";

import { useMemo, useState } from "react";
import { FileInput } from "lucide-react";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";

const MAX_FILE_SIZE_MB = 3;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

type StepOneCreateDraftFormProps = {
  action: (formData: FormData) => void;
};

export function StepOneCreateDraftForm({ action }: StepOneCreateDraftFormProps) {
  const [errors, setErrors] = useState<string[]>([]);
  const [htmlNames, setHtmlNames] = useState<string[]>([]);
  const [gsNames, setGsNames] = useState<string[]>([]);

  const selectedSummary = useMemo(() => {
    const htmlCount = htmlNames.length;
    const gsCount = gsNames.length;
    if (!htmlCount && !gsCount) return "No files selected yet.";
    return `${htmlCount} HTML file(s), ${gsCount} script file(s) selected.`;
  }, [htmlNames, gsNames]);

  function validateFileList(files: File[], label: string) {
    const issues: string[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        issues.push(`${label}: ${file.name} exceeds ${MAX_FILE_SIZE_MB} MB.`);
      }
    }
    return issues;
  }

  function onFilesChange(files: FileList | null, target: "html" | "gs") {
    const list = files ? Array.from(files) : [];
    const issues = validateFileList(list, target === "html" ? "HTML file" : "Script file");

    setErrors((prev) => {
      const nonFileErrors = prev.filter((msg) => !msg.includes("exceeds"));
      return [...nonFileErrors, ...issues];
    });

    if (target === "html") setHtmlNames(list.map((f) => f.name));
    else setGsNames(list.map((f) => f.name));
  }

  return (
    <form
      action={action}
      className="space-y-4"
      onSubmit={(event) => {
        if (errors.length > 0) {
          event.preventDefault();
        }
      }}
    >
      <PendingFormState className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Form name"><input name="name" className="field-input" placeholder="Required only when saving one pasted form" /></Field>
          <Field label="Suggested form ID"><input name="slug" className="field-input" placeholder="Optional for one form; batch uses file names" /></Field>
        </div>
        <Field label="Spreadsheet ID"><input name="spreadsheetId" className="field-input" /></Field>

        <details className="rounded-md border border-surface-border bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-surface-text">Option A: Upload source files</summary>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Field label="index.html file(s)">
              <input
                type="file"
                name="htmlFiles"
                accept=".html,.htm,text/html"
                multiple
                className="field-input"
                onChange={(e) => onFilesChange(e.target.files, "html")}
              />
            </Field>
            <Field label="code.gs file(s)">
              <input
                type="file"
                name="gsFiles"
                accept=".gs,.js,text/plain"
                multiple
                className="field-input"
                onChange={(e) => onFilesChange(e.target.files, "gs")}
              />
            </Field>
          </div>
          <div className="mt-3 space-y-1 text-xs text-surface-muted">
            <p>For multiple forms, upload one HTML file per form. The form ID comes from the HTML file name.</p>
            <p>Use one shared `code.gs` for all forms, or name scripts to match each HTML file, like `leave-request.html` and `leave-request.gs`.</p>
            <p>Dropdowns auto-detect when a sheet tab or column header matches the form field name or label, ignoring spaces, dashes, and case.</p>
            <p>Max file size: {MAX_FILE_SIZE_MB} MB per file for fast draft uploads.</p>
          </div>
        </details>

        <details className="rounded-md border border-surface-border bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-surface-text">Option B: Copy-paste source text</summary>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Field label="index.html source">
              <textarea name="htmlSource" rows={12} placeholder="Paste the full index.html source here..." className="field-input font-mono text-xs" />
            </Field>
            <Field label="code.gs source">
              <textarea name="appsScriptSource" rows={12} placeholder="Paste the full code.gs source here..." className="field-input font-mono text-xs" />
            </Field>
          </div>
        </details>

        <div className="rounded border border-surface-border bg-slate-50 px-3 py-2 text-xs text-surface-muted">{selectedSummary}</div>
        {errors.length > 0 ? (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end">
          <PendingSubmitButton
            type="submit"
            idleLabel={<span className="inline-flex items-center gap-2"><FileInput className="h-4 w-4" /><span>Save draft & open Step 2</span></span>}
            pendingLabel="Uploading and saving draft..."
            className="btn-primary"
            disabled={errors.length > 0}
          />
        </div>
      </PendingFormState>
    </form>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <div><label className="mb-1.5 block text-sm font-semibold text-gray-700">{label}{required ? <span className="text-red-500"> *</span> : null}</label>{children}</div>;
}
