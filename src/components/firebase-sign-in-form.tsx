"use client";

import { useState, useTransition } from "react";
import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { signIn } from "next-auth/react";
import { getFirebaseBrowserAuth } from "@/lib/firebase/client";

type FirebaseSignInFormProps = {
  redirectTo: string;
  className?: string;
};

export function FirebaseSignInForm({ redirectTo, className }: FirebaseSignInFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const email = String(formData.get("email") ?? "").trim();
        const password = String(formData.get("password") ?? "");

        startTransition(async () => {
          setError(null);

          try {
            const { auth, persistenceReady } = getFirebaseBrowserAuth();
            await persistenceReady;
            const credential = await signInWithEmailAndPassword(auth, email, password);
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
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">Work email</label>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="yourname@vienovo.ph"
            disabled={isPending}
            className="w-full rounded-lg border-[1.5px] border-gray-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">Password</label>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            disabled={isPending}
            className="w-full rounded-lg border-[1.5px] border-gray-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 py-2.5 font-semibold text-white shadow-md transition hover:opacity-95 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
        >
          <span>{isPending ? "Signing in..." : "Sign in with Firebase"}</span>
        </button>
        <p className="text-center text-xs text-gray-400">
          Firebase accounts must use a verified <strong>@vienovo.ph</strong> email.
        </p>
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
      </div>
    </form>
  );
}

function resolveFirebaseSignInError(cause: unknown): string {
  if (cause instanceof FirebaseError) {
    switch (cause.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
      case "auth/invalid-email":
        return "The Firebase email or password is invalid.";
      case "auth/too-many-requests":
        return "Firebase temporarily blocked sign-in after too many attempts. Please try again later.";
      case "auth/network-request-failed":
        return "Firebase sign-in could not reach the network.";
      default:
        return "Firebase sign-in failed. Please check the account and try again.";
    }
  }

  if (cause instanceof Error && cause.message) {
    return cause.message;
  }

  return "Firebase sign-in failed.";
}
