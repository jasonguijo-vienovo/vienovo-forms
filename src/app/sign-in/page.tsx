import Image from "next/image";
import { redirect } from "next/navigation";
import { signIn, auth } from "@/auth";
import { FirebaseSignInForm } from "@/components/firebase-sign-in-form";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";

const microsoftConfigured = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
);
const firebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID &&
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY,
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
                  Microsoft sign-in is for Vienovo organization accounts.
                </p>
              </PendingFormState>
            </form>
          ) : null}

          {firebaseConfigured ? (
            <FirebaseSignInForm
              redirectTo={redirectTo}
              className={microsoftConfigured ? "mt-6 border-t border-gray-200 pt-6" : undefined}
            />
          ) : null}

          {!microsoftConfigured && !firebaseConfigured ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
              Sign-in is not configured yet. Add Microsoft Entra ID or Firebase Authentication settings to enable access.
            </div>
          ) : null}

          {firebaseConfigured ? (
            <p className="mt-6 text-center text-xs text-gray-400">
              Your browser should keep you signed in after refresh. External Google users can sign in, while Vienovo employee status is verified from the employee database.
            </p>
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
