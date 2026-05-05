"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminSearchField({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-surface-border bg-white px-3 py-2.5 text-sm text-surface-muted shadow-sm">
      <Search className="h-4 w-4 shrink-0" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-surface-text outline-none placeholder:text-surface-muted"
      />
    </label>
  );
}

export function AdminFilterTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-semibold transition",
              active
                ? "border-brand-700 bg-brand-50 text-brand-700"
                : "border-surface-border bg-white text-surface-muted hover:text-surface-text"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
