import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return <main className="auth-shell">
    <Link className="auth-brand" href="/"><span className="brand-mark">R</span><span><strong>ROZAN</strong><small>Accounting &amp; Advisory</small></span></Link>
    <section className="auth-card">
      <p className="modal-kicker">Secure workspace access</p>
      <h1>Login</h1>
      <p>Use the email address attached to your approved Rozan account. New client accounts are created only after an inquiry is accepted.</p>
      <LoginForm/>
      <p className="auth-note">Need access? <Link href="/#contact">Send an inquiry</Link> and Rozan will invite you after approval.</p>
    </section>
  </main>;
}
