import Image from "next/image";
import { redirect } from "next/navigation";
import { signIn, auth } from "@/auth";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";

const devBypass = process.env.AUTH_DEV_BYPASS === "1";
const microsoftConfigured = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
);
const BRAND_LOGO_SRC = "/brand/vienovo-feed-for-life.png";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { callbackUrl } = await searchParams;
  const redirectTo = callbackUrl || "/dashboard";

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-brand-100 overflow-hidden">
        <div className="bg-gradient-to-r from-brand-700 via-brand-800 to-brand-900 px-8 py-8 text-center">
          <div className="mx-auto mb-4 inline-flex rounded-2xl bg-white/90 px-3 py-2 ring-2 ring-white/30">
            <Image
              src={BRAND_LOGO_SRC}
              alt="Vienovo"
              width={180}
              height={36}
              priority
              className="h-9 w-auto"
            />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Vienovo Forms</h1>
          <p className="text-brand-100 text-sm mt-1">Sign in to submit and track requests</p>
        </div>

        <div className="p-8">
          {microsoftConfigured ? (
            <form
              action={async () => {
                "use server";
                await signIn("microsoft-entra-id", { redirectTo });
              }}
            >
              <PendingFormState className="space-y-4">
                <PendingSubmitButton
                  type="submit"
                  idleLabel={
                    <span className="flex items-center justify-center gap-3">
                      <MicrosoftLogo />
                      <span>Sign in with Microsoft</span>
                    </span>
                  }
                  pendingLabel="Signing in..."
                  className="w-full bg-[#2f2f2f] hover:bg-black text-white font-semibold py-2.5 rounded-lg transition"
                />
                <p className="text-xs text-gray-400 text-center">
                  Only <strong>@vienovo.ph</strong> accounts can sign in.
                </p>
              </PendingFormState>
            </form>
          ) : null}

          {devBypass ? (
            <form
              action={async (formData) => {
                "use server";
                await signIn("credentials", {
                  email: formData.get("email"),
                  redirectTo,
                });
              }}
              className={microsoftConfigured ? "mt-6 space-y-4 border-t border-gray-200 pt-6" : "space-y-4"}
            >
              <PendingFormState className="space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  <strong>Dev bypass is available.</strong>{" "}
                  {microsoftConfigured
                    ? "Use this only if Microsoft sign-in is still being fixed."
                    : "Microsoft sign-in is not fully configured yet, so you can use any @vienovo.ph email."}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Work email
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="yourname@vienovo.ph"
                    className="w-full px-3.5 py-2.5 border-[1.5px] border-gray-300 rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none transition"
                  />
                </div>
                <PendingSubmitButton
                  type="submit"
                  idleLabel={microsoftConfigured ? "Use dev bypass" : "Continue"}
                  pendingLabel="Signing in..."
                  className="w-full bg-gradient-to-br from-brand-600 to-brand-700 text-white font-semibold py-2.5 rounded-lg shadow-md hover:opacity-95 active:scale-[0.99] transition"
                />
              </PendingFormState>
            </form>
          ) : null}

          {!microsoftConfigured && !devBypass ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
              Sign-in is not configured yet. Add Microsoft Entra ID settings or temporarily enable
              dev bypass.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}
