import { useState } from "react";
import type { Dictionary } from "../i18n";
import { ApiClient, ApiRequestError } from "../api/client";
import { TurnstileWidget } from "./TurnstileWidget";

export interface AuthPanelProps {
  t: Dictionary;
  client: ApiClient;
  onAuthenticated: (token: string, accountId: string, role: "player" | "moderator" | "admin") => void;
}

export function AuthPanel({ t, client, onAuthenticated }: AuthPanelProps): JSX.Element {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function describe(error: unknown): string {
    if (error instanceof ApiRequestError) {
      switch (error.code) {
        case "invalid_credentials":
          return t.auth.errorInvalidCredentials;
        case "email_taken":
          return t.auth.errorEmailTaken;
        case "weak_password":
          return t.auth.errorWeakPassword;
        case "invalid_email":
          return t.auth.errorInvalidEmail;
        case "throttled":
          return t.status.quotaLimited;
        default:
          return t.auth.errorGeneric;
      }
    }
    return t.status.offline;
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "register") {
        await client.register(email, password, "tr", turnstileToken || undefined);
      }
      const session = await client.login(email, password, turnstileToken || undefined);
      const me = await client.me(session.token);
      onAuthenticated(session.token, me.accountId, me.role);
    } catch (error) {
      setMessage(describe(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="kvt-auth">
      <div className="kvt-authtabs">
        <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>
          {t.menu.login}
        </button>
        <button type="button" aria-pressed={mode === "register"} onClick={() => setMode("register")}>
          {t.menu.register}
        </button>
      </div>
      <form onSubmit={submit}>
        <label>
          {t.auth.email}
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          {t.auth.password}
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === "register" ? 12 : undefined}
            required
          />
          {mode === "register" && <small>{t.auth.passwordHint}</small>}
        </label>
        <TurnstileWidget onToken={setTurnstileToken} />
        <button type="submit" disabled={busy}>
          {mode === "login" ? t.auth.submitLogin : t.auth.submitRegister}
        </button>
      </form>
      {message && (
        <p className="kvt-error" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}
