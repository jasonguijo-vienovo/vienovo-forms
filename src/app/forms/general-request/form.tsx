"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FormActionResult } from "@/lib/forms/action-result";

type Props = {
  user: { email: string; name: string };
  submitAction: (formData: FormData) => Promise<FormActionResult>;
};

export function GeneralRequestForm({ user, submitAction }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const fd = new FormData(event.currentTarget);

    startTransition(() => {
      void submitAction(fd).then((result) => {
        if (!result.ok) {
          setError(result.error || "Submission failed.");
          return;
        }
        router.push(result.redirectTo);
        router.refresh();
      });
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <section className="app-panel p-5">
        <h1 className="text-xl font-semibold text-surface-text">General Request</h1>
        <p className="mt-1 text-sm text-surface-muted">Starter form scaffold connected to request workflow.</p>
      </section>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <section className="app-panel p-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-surface-text">Email</label>
          <input value={user.email} readOnly className="field-input field-locked" />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-surface-text">Full name</label>
          <input name="fullName" defaultValue={user.name} required className="field-input" />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-surface-text">Request title</label>
          <input name="requestTitle" required className="field-input" placeholder="Enter request title" />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-surface-text">Request details</label>
          <textarea name="requestDetails" rows={5} required className="field-input" placeholder="Describe your request" />
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      </section>
    </form>
  );
}
