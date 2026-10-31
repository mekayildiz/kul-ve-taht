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
  type AdminCharacterDto,
  type AdminEconomyDto,
  type AdminOverviewDto,
} from "../api/client";
import type { Dictionary } from "../i18n";

export interface AdminPanelProps {
  client: ApiClient;
  token: string;
  t: Dictionary;
}

interface AdminState {
  overview: AdminOverviewDto | null;
  characters: AdminCharacterDto[];
  economy: AdminEconomyDto[];
}

export function AdminPanel({ client, token, t }: AdminPanelProps): JSX.Element {
  const [state, setState] = useState<AdminState>({ overview: null, characters: [], economy: [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const [overview, chars, econ] = await Promise.all([
        client.adminOverview(token),
        client.adminCharacters(token),
        client.adminEconomy(token),
      ]);
      setState({ overview, characters: chars.characters, economy: econ.economy });
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
                <button
                  type="button"
                  aria-label={`${c.alive ? t.admin.markDead : t.admin.markAlive}: ${c.givenName} ${c.surname}`}
                  onClick={() => void toggleStatus(c)}
                >
                  {c.alive ? t.admin.markDead : t.admin.markAlive}
                </button>
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
