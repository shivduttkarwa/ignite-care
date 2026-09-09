import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "../api/client";
import { Icon } from "../components/Icons";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/login/", { username, password });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" className="c-signin">
      <div className="c-signin__card">
        <img className="c-signin__logo" src="/logo-full.webp" width={480} height={219}
             alt="Ignite Community Services" />

        <div>
          <h1 className="c-signin__title">Support worker portal</h1>
          <p className="u-small u-muted">Sign in to record care for your shift.</p>
        </div>

        {error && (
          <div className="c-callout c-callout--danger" role="alert">
            <Icon name="alert-circle" />
            <span>{error}</span>
          </div>
        )}

        <form className="o-stack" onSubmit={onSubmit}>
          <div className="c-field">
            <label className="c-field__label" htmlFor="username">Username</label>
            <input className="c-input" id="username" name="username" autoComplete="username"
                   autoCapitalize="none" autoFocus required
                   value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="c-field">
            <label className="c-field__label" htmlFor="password">Password</label>
            <input className="c-input" id="password" name="password" type="password"
                   autoComplete="current-password" required
                   value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="c-btn c-btn--primary c-btn--block" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="u-xs u-faint u-center">
          Access is granted by your manager. There is no public sign-up.
        </p>
      </div>
    </main>
  );
}
