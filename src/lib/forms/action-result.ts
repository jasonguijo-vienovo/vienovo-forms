export type FormActionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export function okRedirect(redirectTo: string): FormActionResult {
  return { ok: true, redirectTo };
}

export function fail(error: string): FormActionResult {
  return { ok: false, error };
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
