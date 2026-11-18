"use client";
import { useState } from "react";
import {
  ArrowRight,
  LockKeyhole,
  Layers3,
  FileText,
  UsersRound,
  BookOpen,
} from "lucide-react";
import { Logo } from "./ui.jsx";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(e.currentTarget);
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error || "Unable to sign in.");
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <main className="entry-screen">
      <section className="entry-art">
        <Logo />
        <div>
          <h1>
            Workshop
            <br />
            <em>accounts.</em>
          </h1>
          <ul>
            {[
              [FileText, "Customer billing"],
              [UsersRound, "Attendance & payroll"],
              [BookOpen, "Purchases & Rojmel"],
            ].map(([Icon, text]) => (
              <li key={text}>
                <Icon size={20} />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <span className="entry-signature">
          <Layers3 size={16} /> Billfold Workshop
        </span>
      </section>
      <section className="entry-form">
        <div className="auth-icon">
          <LockKeyhole size={23} />
        </div>
        <h2>Sign in to Billfold</h2>
        <p>Use your workshop staff account.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Work email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              maxLength="254"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              maxLength="256"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"} <ArrowRight size={16} />
          </button>
        </form>
      </section>
    </main>
  );
}
