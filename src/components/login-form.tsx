"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setMessage("");
        setBusy(true);
        try {
          const r = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: f.get("email"), password: f.get("password") }),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          router.push("/admin");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Não foi possível entrar.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Email
        <input type="email" name="email" autoComplete="username" required />
      </label>
      <label>
        Senha
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          minLength={8}
          required
        />
      </label>
      {message && (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
      <button className="button primary full" disabled={busy}>
        {busy ? "Entrando…" : "Entrar no painel"}
      </button>
    </form>
  );
}
