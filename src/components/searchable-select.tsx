"use client";

import { useMemo, useRef, useState } from "react";

type Option = { value: string; label: string };

type Props = {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

export function SearchableSelect({
  name,
  value,
  onChange,
  options,
  placeholder = "-- Select --",
  required,
  disabled,
  className = "field-input",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const normalized = useMemo(
    () => options.map((o) => ({ ...o, n: `${o.label} ${o.value}`.toLowerCase() })),
    [options]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return normalized.filter((o) => o.n.includes(q)).map(({ value: v, label }) => ({ value: v, label }));
  }, [normalized, options, query]);

  return (
    <div ref={rootRef} className="relative">
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <button
        type="button"
        disabled={disabled}
        className={`${className} w-full text-left`}
        onClick={() => setOpen((v) => !v)}
      >
        {selected?.label || placeholder}
      </button>

      {open && !disabled ? (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-surface-border bg-white shadow-lg">
          <div className="p-2 border-b border-surface-border">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="field-input text-sm"
            />
          </div>
          <div className="max-h-56 overflow-auto p-1">
            <button
              type="button"
              className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-100"
              onClick={() => {
                onChange("");
                setOpen(false);
                setQuery("");
              }}
            >
              {placeholder}
            </button>
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-surface-muted">No matches found.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

