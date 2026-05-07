"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

type PendingSubmitButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  idleLabel: React.ReactNode;
  pendingLabel?: React.ReactNode;
  pendingClassName?: string;
};

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  className,
  pendingClassName,
  disabled,
  children,
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();
  const [clicked, setClicked] = useState(false);
  const isBusy = pending || clicked;
  const resolvedPendingLabel = pendingLabel ?? "Processing...";

  useEffect(() => {
    if (!pending) setClicked(false);
  }, [pending]);

  return (
    <button
      {...props}
      onClick={(event) => {
        if (isBusy) {
          event.preventDefault();
          return;
        }
        setClicked(true);
        props.onClick?.(event);
      }}
      disabled={disabled || isBusy}
      aria-busy={isBusy}
      aria-live="polite"
      data-state={isBusy ? "pending" : "idle"}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition disabled:pointer-events-none disabled:cursor-wait disabled:opacity-60",
        isBusy && "shadow-inner",
        isBusy && pendingClassName,
        className
      )}
    >
      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      <span>{isBusy ? resolvedPendingLabel : idleLabel}</span>
      {!idleLabel && !pendingLabel ? children : null}
    </button>
  );
}
