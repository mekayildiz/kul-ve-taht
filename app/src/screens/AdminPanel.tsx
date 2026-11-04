/**
 * Yonetim konsolu arayuzu (tasarim belgesi 20).
 *
 * Belge 20: butce, pazar mudahalesi, kota ve kullanici/karakter yonetimi
 * panelleri tam oyuna dahildir. Bu ekran SUNUCU otoritesini kullanir:
 * sayilar `/api/admin/*` uclarindan gelir; istemci yalnizca gosterir ve
 * canli/olu durum degisikligi ister (bkz. auth/authorize.ts admin:any).
 *
 * Erisilebilirlik (belge 19): tablolar baslik satirlari ile isaretlenir,
 * eylem dugmeleri klavye ile erisilebilir ve ekran okuyucu etiketi tasir.
 */

import { useEffect, useState } from "react";
import {
  ApiClient,
  ApiRequestError,
  type AccountRoleDto,
  type AdminAccountDto,
  type AdminCharacterDto,
  type AdminEconomyDto,
  type AdminOverviewDto,
} from "../api/client";
import type { Dictionary } from "../i18n";

export interface AdminPanelProps {
  client: ApiClient;
  token: string;
  t: Dictionary;
  /** Yonetim paneli moderator'e de gorunur; yazma yalnizca admin'de aciktir. */
  role: AccountRoleDto;
}

interface AdminState {
  overview: AdminOverviewDto | null;
  characters: AdminCharacterDto[];
  economy: AdminEconomyDto[];
  quota: Record<string, unknown> | null;
  accounts: AdminAccountDto[];
}

export function AdminPanel({ client, token, t, role }: AdminPanelProps): JSX.Element {
  const isAdmin = role === "admin";
  const [state, setState] = useState<AdminState>({
    overview: null,
    characters: [],
    economy: [],
    quota: null,
    accounts: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const [overview, chars, econ, quota, accounts] = await Promise.all([
        client.adminOverview(token),
        client.adminCharacters(token),
        client.adminEconomy(token),
        client.adminQuota(token).catch(() => null),
        // Hesap listesi yalnizca yoneticiye acik; moderator'de sessizce bos kalir.
        isAdmin ? client.adminAccounts(token).catch(() => ({ accounts: [] })) : Promise.resolve({ accounts: [] }),
      ]);
      setState({ overview, characters: chars.characters, economy: econ.economy, quota, accounts: accounts.accounts });
    } catch {
      setError(t.admin.adminOnly);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // Yalnizca oturum degistiginde yeniden yuklenir.
  }, [token]);

  async function toggleStatus(c: AdminCharacterDto): Promise<void> {
    await client.adminSetCharacterStatus(token, c.id, c.alive ? "dead" : "alive");
    await load();
  }

  async function seedWorld(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await client.adminSeedWorld(token);
      setMessage(t.admin.seeded);
      await load();
    } catch {
      setError(t.admin.adminOnly);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(account: AdminAccountDto, next: AccountRoleDto): Promise<void> {
    setMessage(null);
    setError(null);
    try {
      await client.adminSetAccountRole(token, account.id, next);
      setMessage(t.admin.roleSaved);
      await load();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "last_admin") {
        setError(t.admin.lastAdmin);
      } else {
        setError(t.admin.adminOnly);
      }
    }
  }

  if (error) {
    return (
      <section className="kvt-admin" aria-label={t.admin.adminTitle}>
        <h2>{t.admin.adminTitle}</h2>
        <p role="alert">{error}</p>
        <button type="button" onClick={() => void load()} disabled={busy}>
          {t.admin.load}
        </button>
      </section>
    );
  }

  const o = state.overview;

  return (
    <section className="kvt-admin" aria-label={t.admin.adminTitle}>
      <h2>{t.admin.adminTitle}</h2>
      {!isAdmin && <p className="kvt-hint">{t.admin.roleReadOnly}</p>}

      {o && (
        <table className="kvt-admin-overview">
          <caption>{t.admin.overview}</caption>
          <tbody>
            <tr>
              <th scope="row">{t.admin.accounts}</th>
              <td>{o.accounts}</td>
              <th scope="row">{t.admin.characters}</th>
              <td>{o.characters}</td>
            </tr>
            <tr>
              <th scope="row">{t.admin.aliveCharacters}</th>
              <td>{o.aliveCharacters}</td>
              <th scope="row">{t.admin.settlements}</th>
              <td>{o.settlements}</td>
            </tr>
            <tr>
              <th scope="row">{t.admin.kingdoms}</th>
              <td>{o.kingdoms}</td>
              <th scope="row">{t.admin.totalGold}</th>
              <td>{o.totalGold}</td>
            </tr>
            <tr>
              <th scope="row">{t.admin.properties}</th>
              <td>{o.properties}</td>
              <th scope="row">{t.admin.companies}</th>
              <td>{o.companies}</td>
            </tr>
            <tr>
              <th scope="row">{t.admin.auctionsOpen}</th>
              <td>{o.auctionsOpen}</td>
              <th scope="row">{t.admin.gameDay}</th>
              <td>
                {o.gameDay} / {o.gameYear}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="kvt-admin-actions">
        <h3>{t.admin.actions}</h3>
        {isAdmin && (
          <button type="button" onClick={() => void seedWorld()} disabled={busy}>
            {t.admin.seedWorld}
          </button>
        )}
        <button type="button" onClick={() => void load()} disabled={busy}>
          {t.admin.load}
        </button>
        {message && <p className="kvt-ok">{message}</p>}
      </div>

      {isAdmin && (
        <>
          <h3>{t.admin.accountList}</h3>
          <table className="kvt-admin-accounts">
            <thead>
              <tr>
                <th scope="col">{t.admin.email}</th>
                <th scope="col">{t.admin.role}</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {state.accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.email}</td>
                  <td>
                    <select
                      aria-label={`${t.admin.role}: ${a.email}`}
                      value={a.role}
                      onChange={(e) => void changeRole(a, e.target.value as AccountRoleDto)}
                      disabled={busy}
                    >
                      <option value="player">{t.admin.roles.player}</option>
                      <option value="moderator">{t.admin.roles.moderator}</option>
                      <option value="admin">{t.admin.roles.admin}</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label={`${t.admin.changeRole}: ${a.email}`}
                      onClick={() => void changeRole(a, a.role)}
                      disabled={busy}
                    >
                      {t.admin.changeRole}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {state.quota && (
        <table className="kvt-admin-quota">
          <caption>{t.admin.quota}</caption>
          <tbody>
            {Object.entries(state.quota).map(([key, value]) => (
              <tr key={key}>
                <th scope="row">{key}</th>
                <td>{typeof value === "object" ? JSON.stringify(value) : String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>{t.admin.characterList}</h3>
      <table className="kvt-admin-characters">
        <thead>
          <tr>
            <th scope="col">{t.admin.characters}</th>
            <th scope="col">{t.play.gold}</th>
            <th scope="col">{t.admin.settlements}</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {state.characters.map((c) => (
            <tr key={c.id}>
              <td>
                {c.givenName} {c.surname}
              </td>
              <td>{c.gold}</td>
              <td>{c.currentSettlement ?? "-"}</td>
              <td>
                {isAdmin && (
                  <button
                    type="button"
                    aria-label={`${c.alive ? t.admin.markDead : t.admin.markAlive}: ${c.givenName} ${c.surname}`}
                    onClick={() => void toggleStatus(c)}
                  >
                    {c.alive ? t.admin.markDead : t.admin.markAlive}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t.admin.economyList}</h3>
      <table className="kvt-admin-economy">
        <thead>
          <tr>
            <th scope="col">{t.admin.settlements}</th>
            <th scope="col">{t.play.inventory}</th>
            <th scope="col">{t.play.market}</th>
            <th scope="col">{t.play.gold}</th>
          </tr>
        </thead>
        <tbody>
          {state.economy.slice(0, 25).map((e) => (
            <tr key={`${e.settlementId}-${e.itemId}`}>
              <td>{e.settlementId}</td>
              <td>{e.itemId}</td>
              <td>{e.supply}</td>
              <td>{e.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
