"use client";

import { useState, useTransition } from "react";
import { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { signIn } from "next-auth/react";
import { getFirebaseBrowserAuth } from "@/lib/firebase/client";

type FirebaseSignInFormProps = {
  redirectTo: string;
  className?: string;
};

export function FirebaseSignInForm({ redirectTo, className }: FirebaseSignInFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
  });

  return (
    <div className={className}>
      <div className="space-y-4">
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              setError(null);

              try {
                const { auth, persistenceReady } = getFirebaseBrowserAuth();
                await persistenceReady;
                const credential = await signInWithPopup(auth, provider);
                const idToken = await credential.user.getIdToken(true);

                const result = await signIn("firebase", {
                  idToken,
                  redirect: false,
                  redirectTo,
                });

                if (result?.error) {
                  await firebaseSignOut(auth);
                  setError("Firebase sign-in was rejected by the server.");
                  return;
                }

                window.location.assign(result?.url || redirectTo);
              } catch (cause) {
                setError(resolveFirebaseSignInError(cause));
              }
            });
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 py-2.5 font-semibold text-white shadow-md transition hover:opacity-95 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
        >
          <GoogleLogo />
          <span>{isPending ? "Signing in..." : "Sign in with Google"}</span>
        </button>
        <p className="text-center text-xs text-gray-400">
          Google sign-in is available for employees and external requesters. Vienovo employees are verified from the internal employee database.
        </p>
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function resolveFirebaseSignInError(cause: unknown): string {
  if (cause instanceof FirebaseError) {
    switch (cause.code) {
      case "auth/account-exists-with-different-credential":
        return "This Google account is already linked through a different Firebase sign-in method.";
      case "auth/popup-blocked":
        return "The Google sign-in popup was blocked by the browser.";
      case "auth/popup-closed-by-user":
        return "The Google sign-in popup was closed before sign-in finished.";
      case "auth/cancelled-popup-request":
        return "Another Google sign-in popup is already open.";
      case "auth/unauthorized-domain":
        return "This site domain is not yet allowed in Firebase Authentication.";
      case "auth/too-many-requests":
        return "Firebase temporarily blocked sign-in after too many attempts. Please try again later.";
      case "auth/network-request-failed":
        return "Firebase sign-in could not reach the network.";
      default:
        return "Google sign-in failed. Please check the Firebase provider setup and try again.";
    }
  }

  if (cause instanceof Error && cause.message) {
    return cause.message;
  }

  return "Google sign-in failed.";
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#fff"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.72-1.58 2.68-3.9 2.68-6.62Z"
      />
      <path
        fill="#fff"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.32A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#fff"
        d="M3.98 10.72A5.41 5.41 0 0 1 3.7 9c0-.6.1-1.18.28-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.02-2.32Z"
      />
      <path
        fill="#fff"
        d="M9 3.58c1.32 0 2.5.46 3.42 1.34l2.56-2.56C13.46.94 11.42 0 9 0A9 9 0 0 0 .96 4.96l3.02 2.32c.7-2.12 2.68-3.7 5.02-3.7Z"
      />
    </svg>
  );
}
