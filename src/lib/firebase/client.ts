import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";

const firebaseWebConfig = {
  apiKey: String(process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "").trim(),
  authDomain: String(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "").trim(),
  projectId: String(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim(),
  appId: String(process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "").trim(),
  storageBucket: String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "").trim(),
  messagingSenderId: String(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "").trim(),
  measurementId: String(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "").trim(),
};

function getFirebaseWebConfig() {
  const { apiKey, authDomain, projectId, appId } = firebaseWebConfig;

  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error("Firebase web configuration is incomplete.");
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: firebaseWebConfig.storageBucket || undefined,
    messagingSenderId: firebaseWebConfig.messagingSenderId || undefined,
    measurementId: firebaseWebConfig.measurementId || undefined,
  };
}

export function isFirebaseWebConfigured(): boolean {
  return Boolean(
    firebaseWebConfig.apiKey &&
      firebaseWebConfig.authDomain &&
      firebaseWebConfig.projectId &&
      firebaseWebConfig.appId,
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
