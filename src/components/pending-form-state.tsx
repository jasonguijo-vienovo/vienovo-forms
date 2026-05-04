"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

export function PendingFormState({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <div
      aria-busy={pending}
      className={cn(
        "relative transition-opacity duration-200",
        pending && "opacity-75",
        className
      )}
    >
      {pending ? (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] bg-white/35" />
      ) : null}
      {children}
    </div>
  );
}
