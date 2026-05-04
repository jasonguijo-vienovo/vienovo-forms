import { cn } from "@/lib/utils";

export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return <div className={cn("animate-pulse rounded bg-slate-200", className)} />;
}

export function AppLoadingShell() {
  return (
    <main className="app-page space-y-6">
      <Skeleton className="h-12 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="app-panel p-5 space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    </main>
  );
}

export function AdminLoadingShell() {
  return (
    <div className="admin-page">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="app-panel p-5 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="app-panel p-5 space-y-4">
        <Skeleton className="h-5 w-44" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="border border-surface-border p-4 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardLoadingShell() {
  return (
    <main className="app-page space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <section className="space-y-4">
        <Skeleton className="h-4 w-28" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="app-panel p-5 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <section key={index} className="app-panel p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 3 }).map((__, row) => (
              <div key={row} className="border border-surface-border p-3 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}

export function FormLoadingShell() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
      <div className="app-panel p-6 space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="app-panel p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
          <Skeleton className="h-28 w-full" />
        </div>
      ))}
    </main>
  );
}

export function RequestLoadingShell() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
      <div className="app-panel p-6 space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="border border-surface-border p-4 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </main>
  );
}

export function SignInLoadingShell() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md app-panel overflow-hidden shadow-lg">
        <div className="px-8 py-8 bg-brand-700 space-y-4">
          <Skeleton className="h-12 w-44 bg-white/30" />
          <Skeleton className="h-6 w-36 bg-white/25" />
          <Skeleton className="h-4 w-48 bg-white/20" />
        </div>
        <div className="p-8 space-y-4">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </main>
  );
}
