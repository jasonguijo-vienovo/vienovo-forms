import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function getFirebaseAdminProjectId(): string {
  return readEnv("FIREBASE_ADMIN_PROJECT_ID") || readEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
}

function getFirebaseAdminPrivateKey(): string {
  return readEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(
    getFirebaseAdminProjectId() &&
      readEnv("FIREBASE_ADMIN_CLIENT_EMAIL") &&
      getFirebaseAdminPrivateKey(),
  );
}

function getFirebaseAdminApp() {
  const existing = getApps().find((app) => app.name === "vienovo-firebase-admin");
  if (existing) return existing;

  const projectId = getFirebaseAdminProjectId();
  const clientEmail = readEnv("FIREBASE_ADMIN_CLIENT_EMAIL");
  const privateKey = getFirebaseAdminPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin credentials are incomplete.");
  }

  return initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    },
    "vienovo-firebase-admin",
  );
}

export async function verifyFirebaseIdToken(idToken: string) {
  return getAuth(getFirebaseAdminApp()).verifyIdToken(idToken);
}
