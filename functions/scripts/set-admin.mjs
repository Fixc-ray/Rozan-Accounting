import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import path from "node:path";
import { fileURLToPath } from "node:url";

const functionsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const candidate of [path.resolve(functionsRoot, "../.env.local"), path.resolve(functionsRoot, ".env.local")]) {
  try { process.loadEnvFile(candidate); break; } catch {}
}

const email = (process.argv[2] || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
if (!email || !projectId) {
  console.error("Set ADMIN_EMAIL and NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local, then run this command again.");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
let user;
try {
  user = await auth.getUserByEmail(email);
} catch (error) {
  if (error?.code !== "auth/user-not-found") throw error;
  user = await auth.createUser({ email, disabled: false });
}
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role: "admin" });
await getFirestore().collection("users").doc(user.uid).set({
  email,
  fullName: user.displayName || "Rozan Administrator",
  role: "admin",
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

const passwordSetupLink = await auth.generatePasswordResetLink(email);

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
let emailSent = false;
if (apiKey) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
  });
  emailSent = response.ok;
  if (!response.ok) {
    const details = await response.text();
    console.warn(`Firebase could not send the password setup email (${response.status}). ${details}`);
  }
}
console.log(`Administrator configured for ${email}.`);
console.log(emailSent
  ? "Firebase requested a password setup email. You may also use the direct link below."
  : "Open the direct password setup link below:");
console.log(passwordSetupLink);
