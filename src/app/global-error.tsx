"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isProd = process.env.NODE_ENV === "production";

  return (
    <html>
      <body>
        <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-gray-50">
          <div className="max-w-lg w-full bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <h1 className="text-xl font-bold text-gray-800">
              Internal Server Error
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Something went wrong while loading this app.
            </p>

            {error.digest && (
              <p className="text-xs text-gray-400 mt-3">
                Digest: {error.digest}
              </p>
            )}

            {!isProd && (
              <pre className="mt-4 text-xs bg-gray-50 border border-gray-200 rounded-xl p-3 overflow-auto text-gray-700 whitespace-pre-wrap">
                {String(error?.message || error)}
              </pre>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={reset}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 transition"
              >
                Try again
              </button>
              <a
                href="/"
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition"
              >
                Go home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}

