import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";

function readPublicEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function getFirebaseWebConfig() {
  const apiKey = readPublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY");
  const authDomain = readPublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  const projectId = readPublicEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const appId = readPublicEnv("NEXT_PUBLIC_FIREBASE_APP_ID");

  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error("Firebase web configuration is incomplete.");
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: readPublicEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET") || undefined,
    messagingSenderId: readPublicEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") || undefined,
    measurementId: readPublicEnv("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID") || undefined,
  };
}

export function isFirebaseWebConfigured(): boolean {
  return Boolean(
    readPublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY") &&
      readPublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") &&
      readPublicEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID") &&
      readPublicEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  );
}

function getFirebaseApp() {
  if (getApps().length) return getApp();
  return initializeApp(getFirebaseWebConfig());
}

let persistenceReady: Promise<void> | null = null;

export function getFirebaseBrowserAuth() {
  const auth = getAuth(getFirebaseApp());
  if (!persistenceReady) {
    persistenceReady = setPersistence(auth, browserLocalPersistence);
  }
  return { auth, persistenceReady };
}
