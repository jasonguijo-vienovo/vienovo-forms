export default function Loading() {
  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <div className="rounded-xl border border-surface-border bg-white px-5 py-4 text-sm font-semibold text-surface-text shadow-xl">
        Submitting request...
      </div>
    </div>
  );
}
