"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type ClickDropdownProps = {
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  trigger: ReactNode;
  children: ReactNode;
};

export function ClickDropdown({
  className,
  triggerClassName,
  panelClassName,
  trigger,
  children,
}: ClickDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(event.target as Node)) setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? <div className={panelClassName}>{children}</div> : null}
    </div>
  );
}
