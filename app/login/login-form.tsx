"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getIdTokenResult, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { firebaseConfigured, getFirebaseServices } from "@/lib/firebase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseConfigured) return;
    const { auth } = getFirebaseServices();
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      const token = await getIdTokenResult(user, true);
      const role = token.claims.role;
      if (role === "admin") router.replace("/admin");
      else if (role === "client") router.replace("/portal");
    });
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const { auth } = getFirebaseServices();
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await getIdTokenResult(credential.user, true);
      if (token.claims.role === "admin") router.replace("/admin");
      else if (token.claims.role === "client") router.replace("/portal");
      else {
        await signOut(auth);
        throw new Error("This account has not been approved by Rozan.");
      }
    } catch (reason) { setError(friendlyAuthError(reason)); }
    finally { setBusy(false); }
  }

  async function resetPassword() {
    if (!email.trim()) return setError("Enter your email address first.");
    setBusy(true); setError(""); setMessage("");
    try {
      const { auth } = getFirebaseServices();
      await sendPasswordResetEmail(auth, email.trim(), { url: `${window.location.origin}/login`, handleCodeInApp: false });
      setMessage("Firebase sent a secure password setup link if this approved account exists.");
    } catch (reason) { setError(friendlyAuthError(reason)); }
    finally { setBusy(false); }
  }

  if (!firebaseConfigured) return <div className="firebase-setup" role="status"><strong>Firebase setup required</strong><span>Copy <code>.env.example</code> to <code>.env.local</code> and add your Firebase web app values.</span></div>;
  return <form className="auth-form" onSubmit={submit}>
    <label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email"/></label>
    <label>Password<input required type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password"/></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-success" role="status">{message}</p>}
    <button className="button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    <button className="auth-reset" type="button" onClick={() => void resetPassword()} disabled={busy}>Set or reset password</button>
  </form>;
}

function friendlyAuthError(reason: unknown) {
  const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : "";
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(code)) return "The email or password is incorrect.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait and try again.";
  return reason instanceof Error ? reason.message : "Sign-in could not be completed.";
}
