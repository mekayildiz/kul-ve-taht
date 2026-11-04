/**
 * Hesap guvenligi paneli: aktif oturumlar ve iki adimli dogrulama (2FA)
 * (tasarim belgesi 21.1).
 *
 * Tum islemler SUNUCU tarafinda; istemci hicbir sirri uretmez. TOTP sirri
 * yalnizca kurulum ekraninda gosterilir; sunucu sirri sifreli saklar.
 */

import { useEffect, useState } from "react";
import { ApiClient, ApiRequestError, type AccountSessionDto } from "../api/client";
import type { Dictionary } from "../i18n";

export interface SecurityPanelProps {
  client: ApiClient;
  token: string;
  t: Dictionary;
}

export function SecurityPanel({ client, token, t }: SecurityPanelProps): JSX.Element {
  const [sessions, setSessions] = useState<AccountSessionDto[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    const [sess, fa] = await Promise.all([
      client.accountSessions(token).catch(() => ({ sessions: [] })),
      client.twoFactorStatus(token).catch(() => ({ enabled: false })),
    ]);
    setSessions(sess.sessions);
    setEnabled(fa.enabled);
  }

  useEffect(() => {
    void load();
    // Yalnizca oturum degistiginde yeniden yuklenir.
  }, [client, token]);

  async function run(action: () => Promise<unknown>, okMessage?: string): Promise<void> {
    setMessage(null);
    setError(null);
    try {
      await action();
      if (okMessage) setMessage(okMessage);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.admin.adminOnly);
    }
  }

  return (
    <section className="kvt-account-security" aria-label={t.admin.security}>
      <h3>{t.admin.security}</h3>
      {message && <p className="kvt-ok">{message}</p>}
      {error && <p role="alert">{error}</p>}

      <h4>{t.admin.sessions}</h4>
      <button type="button" onClick={() => void run(() => client.revokeOtherSessions(token), t.admin.sessionsRevoked)}>
        {t.admin.revokeOthers}
      </button>
      <table className="kvt-admin-sessions">
        <thead>
          <tr>
            <th scope="col">{t.admin.sessions}</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>
                {s.userAgent ?? "-"}
                {s.current && <span className="kvt-current"> ({t.admin.sessionCurrent})</span>}
              </td>
              <td>
                {!s.current && (
                  <button type="button" onClick={() => void run(() => client.revokeSession(token, s.id))}>
                    {t.admin.revoke}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>
        {t.admin.twoFactor}: {enabled ? t.admin.twoFactorEnabled : t.admin.twoFactorDisabled}
      </h4>
      {!enabled && !secret && (
        <button
          type="button"
          onClick={() =>
            void (async () => {
              setError(null);
              try {
                const res = await client.twoFactorSetup(token);
                setSecret(res.secret);
              } catch (err) {
                setError(err instanceof ApiRequestError ? err.message : t.admin.adminOnly);
              }
            })()
          }
        >
          {t.admin.enable2fa}
        </button>
      )}
      {!enabled && secret && (
        <div>
          <p>
            {t.admin.twoFactorSecret}: <code>{secret}</code>
          </p>
          <label>
            {t.admin.twoFactorCode}
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          </label>
          <button
            type="button"
            onClick={() =>
              void (async () => {
                setMessage(null);
                setError(null);
                try {
                  const res = await client.twoFactorConfirm(token, code);
                  setRecoveryCodes(res.recoveryCodes);
                  setSecret(null);
                  setMessage(t.admin.twoFactorSaved);
                  await load();
                } catch (err) {
                  setError(err instanceof ApiRequestError ? err.message : t.admin.adminOnly);
                }
              })()
            }
          >
            {t.admin.confirm2fa}
          </button>
        </div>
      )}
      {recoveryCodes.length > 0 && (
        <div>
          <p>{t.admin.recoveryCodes}</p>
          <ul>
            {recoveryCodes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {enabled && (
        <div>
          <label>
            {t.admin.twoFactorCode}
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          </label>
          <button type="button" onClick={() => void run(() => client.twoFactorDisable(token, code), t.admin.twoFactorSaved)}>
            {t.admin.disable2fa}
          </button>
        </div>
      )}
    </section>
  );
}
