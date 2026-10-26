import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(config).every((value) => value && value !== "replace_me" && !value.startsWith("your-"));

type FirebaseServices = { app: FirebaseApp; auth: Auth; db: Firestore; functions: Functions };
let services: FirebaseServices | null = null;

export function getFirebaseServices(): FirebaseServices {
  if (!firebaseConfigured) throw new Error("Firebase is not configured. Copy .env.example to .env.local and add your Firebase web app values.");
  if (services) return services;
  const app = getApps().length ? getApp() : initializeApp(config);
  services = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    functions: getFunctions(app, process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1"),
  };
  connectEmulatorsOnce(services);
  return services;
}

function connectEmulatorsOnce(current: FirebaseServices) {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true") return;
  const globalState = globalThis as typeof globalThis & { __rozanFirebaseEmulators?: boolean };
  if (globalState.__rozanFirebaseEmulators) return;
  connectAuthEmulator(current.auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(current.db, "127.0.0.1", 8080);
  connectFunctionsEmulator(current.functions, "127.0.0.1", 5001);
  globalState.__rozanFirebaseEmulators = true;
}
