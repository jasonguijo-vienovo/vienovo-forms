"use client";

import { useMemo, useState } from "react";

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
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const normalized = useMemo(
    () =>
      options.map((o) => ({
        ...o,
        _label: o.label.toLowerCase(),
        _value: o.value.toLowerCase(),
      })),
    [options]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return normalized
      .filter((o) => o._label.includes(q) || o._value.includes(q))
      .map(({ value, label }) => ({ value, label }));
  }, [normalized, options, query]);

  return (
    <div className="space-y-2">
      {searchOpen ? (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search options..."
          className="field-input text-sm"
          disabled={disabled}
        />
      ) : null}
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        className={className}
        onFocus={() => setSearchOpen(true)}
        onClick={() => setSearchOpen(true)}
        onBlur={() => {
          if (!query.trim()) setSearchOpen(false);
        }}
      >
        <option value="">{placeholder}</option>
        {filtered.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
