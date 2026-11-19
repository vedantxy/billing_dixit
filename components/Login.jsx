"use client";
import { useState } from "react";
import {
  ArrowRight,
  LockKeyhole,
  Layers3,
  FileText,
  UsersRound,
  BookOpen,
  ShieldCheck,
  CheckCircle2,
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
          <h2>
            I Shree
            <br />
            <span>Enterprise.</span>
          </h2>
          <p>
            Complete cloud billing, factory jobwork challans, payroll, and operations platform.
          </p>
          <ul className="entry-art-features">
            {[
              [FileText, "Automated GST Invoicing & Line Item Generation"],
              [BookOpen, "Factory Jobwork, Challans & Monthly Accounts"],
              [UsersRound, "Staff Attendance, Wages & Payroll"],
              [ShieldCheck, "Enterprise Letterpad & Secure Statement PDF"],
            ].map(([Icon, text]) => (
              <li key={text}>
                <span className="feat-icon">
                  <Icon size={18} />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="entry-art-footer">
          <Layers3 size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Powered by I Shree Enterprise Cloud Suite
        </div>
      </section>

      <section className="entry-form">
        <div className="entry-form-inner">
          <div className="auth-icon" style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "var(--gold-light, #FDF8EC)",
            border: "1px solid rgba(201,168,76,0.3)",
            display: "grid",
            placeItems: "center",
            color: "var(--gold, #C9A84C)",
            marginBottom: 20
          }}>
            <LockKeyhole size={22} />
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to access your enterprise billing workspace</p>
          
          <form onSubmit={submit}>
            <label className="field">
              <span>Work email</span>
              <input
                name="email"
                type="email"
                placeholder="staff@ishree.com"
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
                placeholder="••••••••"
                required
                autoComplete="current-password"
                maxLength="256"
              />
            </label>
            {error && (
              <p className="entry-error" role="alert" style={{ color: "var(--danger)", margin: "4px 0", fontSize: 13 }}>
                {error}
              </p>
            )}
            <button className="primary" disabled={busy} style={{
              width: "100%",
              padding: "12px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: 10,
              fontSize: 14,
              fontWeight: 600,
            }}>
              {busy ? "Signing in…" : "Sign in to Dashboard"} <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
