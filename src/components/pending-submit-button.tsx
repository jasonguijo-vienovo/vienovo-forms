"use client";

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

  return (
    <button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition disabled:cursor-wait disabled:opacity-60",
        pending && "shadow-inner",
        pending && pendingClassName,
        className
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      <span>{pending ? pendingLabel ?? idleLabel : idleLabel}</span>
      {!idleLabel && !pendingLabel ? children : null}
    </button>
  );
}
