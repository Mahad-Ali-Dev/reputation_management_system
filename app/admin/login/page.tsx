"use client";

import { Logo } from "@/components/shell/logo";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Login failed");
        return;
      }
      router.push("/admin");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(at top, rgba(99,102,241,.08), transparent 60%), var(--bg, #f6f7f4)",
        fontFamily: "var(--f-ui)",
      }}
    >
      <div
        className="ds-card"
        style={{
          width: "100%",
          maxWidth: 380,
          padding: "28px 28px 24px",
          boxShadow: "0 20px 60px -20px rgba(11,13,14,.18)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Logo mode="mark" size={42} />
          <h1
            style={{
              marginTop: 12,
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              margin: "12px 0 0",
            }}
          >
            Repulabs Admin
          </h1>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "#6366f1",
              background: "#eef2ff",
              padding: "2px 8px",
              borderRadius: 4,
              marginTop: 4,
            }}
          >
            INTERNAL STAFF ONLY
          </span>
          <p
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "var(--rl-muted)",
              textAlign: "center",
            }}
          >
            All actions are audit-logged with your admin ID.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@repulabs.com"
            style={inputStyle}
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={inputStyle}
          />
          {error && (
            <p
              style={{
                fontSize: 12,
                color: "#b91c1c",
                background: "#fee2e2",
                padding: "8px 10px",
                borderRadius: 7,
                margin: 0,
              }}
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 4,
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: submitting ? "var(--rl-muted)" : "var(--ink)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p
          style={{
            marginTop: 18,
            fontSize: 11,
            color: "var(--rl-muted)",
            textAlign: "center",
            lineHeight: 1.55,
          }}
        >
          First-time setup:{" "}
          <code
            className="mono"
            style={{
              background: "var(--surface-2, #fafbf8)",
              padding: "1px 6px",
              borderRadius: 4,
              fontSize: 10.5,
            }}
          >
            pnpm admin:create — you@example.com super_admin
          </code>
        </p>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  fontSize: 13,
  outline: "none",
  color: "var(--ink)",
};
