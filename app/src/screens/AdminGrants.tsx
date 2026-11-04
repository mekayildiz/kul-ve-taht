/**
 * Yonetim paneli: uye islemleri (para, esya, nitelik, canli durum) ve denetim
 * kaydi (tasarim belgesi 20).
 *
 * Tum degerler SUNUCUDA dogrulanir; bu bilesen yalnizca istek gonderir ve
 * sonucu gosterir. Her islem `audit_log`'a yazilir.
 */

import { useEffect, useState } from "react";
import {
  ApiClient,
  ApiRequestError,
  type AdminAuditDto,
  type AdminCharacterDto,
  type AdminItemDto,
} from "../api/client";
import type { Dictionary } from "../i18n";

const ATTRIBUTE_KEYS = [
  "strength",
  "agility",
  "endurance",
  "intellect",
  "charisma",
  "perception",
  "leadership",
] as const;

export interface AdminGrantsProps {
  client: ApiClient;
  token: string;
  t: Dictionary;
  characters: AdminCharacterDto[];
}

export function AdminGrants({ client, token, t, characters }: AdminGrantsProps): JSX.Element {
  const [items, setItems] = useState<AdminItemDto[]>([]);
  const [audit, setAudit] = useState<AdminAuditDto[]>([]);
  const [selected, setSelected] = useState<string>(characters[0]?.id ?? "");
  const [attrDraft, setAttrDraft] = useState<Record<string, number>>({});
  const [goldDelta, setGoldDelta] = useState("100");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [vitals, setVitals] = useState({ health: "100", energy: "100", reputation: "0" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [catalog, log] = await Promise.all([
        client.adminItems(token).catch(() => ({ items: [] })),
        client.adminAudit(token).catch(() => ({ entries: [] })),
      ]);
      setItems(catalog.items);
      setAudit(log.entries);
      if (catalog.items[0]) setItemId((prev) => prev || catalog.items[0]!.id);
    })();
    // Yalnizca oturum degistiginde yeniden yuklenir.
  }, [client, token]);

  useEffect(() => {
    if (!selected) {
      setAttrDraft({});
      return;
    }
    void (async () => {
      const res = await client.adminAttributes(token, selected).catch(() => null);
      setAttrDraft(res ? { ...res.attributes } : {});
    })();
  }, [client, token, selected]);

  async function refreshAudit(): Promise<void> {
    const log = await client.adminAudit(token).catch(() => ({ entries: [] }));
    setAudit(log.entries);
  }

  async function run(action: () => Promise<unknown>, okMessage: string): Promise<void> {
    setMessage(null);
    setError(null);
    try {
      await action();
      setMessage(okMessage);
      await refreshAudit();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.admin.adminOnly);
    }
  }

  return (
    <section className="kvt-admin-grants" aria-label={t.admin.grantTitle}>
      <h3>{t.admin.grantTitle}</h3>

      <label>
        {t.admin.selectCharacter}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.givenName} {c.surname}
            </option>
          ))}
        </select>
      </label>

      {message && <p className="kvt-ok">{message}</p>}
      {error && <p role="alert">{error}</p>}

      <fieldset>
        <legend>{t.admin.grantGold}</legend>
        <label>
          {t.admin.goldDelta}
          <input type="number" value={goldDelta} onChange={(e) => setGoldDelta(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={!selected}
          onClick={() => void run(() => client.adminGrantGold(token, selected, Number(goldDelta)), t.admin.goldSaved)}
        >
          {t.admin.grantGold}
        </button>
      </fieldset>

      <fieldset>
        <legend>{t.admin.grantItem}</legend>
        <label>
          {t.admin.grantItem}
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.admin.itemQuantity}
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={!selected || !itemId}
          onClick={() => void run(() => client.adminGrantItem(token, selected, itemId, Number(quantity)), t.admin.itemSaved)}
        >
          {t.admin.grantItem}
        </button>
        <button
          type="button"
          disabled={!selected || !itemId}
          onClick={() => void run(() => client.adminGrantItem(token, selected, itemId, Number(quantity), "revoke"), t.admin.itemSaved)}
        >
          {t.admin.revokeItem}
        </button>
      </fieldset>

      <fieldset>
        <legend>{t.admin.attributes}</legend>
        {ATTRIBUTE_KEYS.map((key) => (
          <label key={key}>
            {t.admin.attributeNames[key]}
            <input
              type="number"
              min="1"
              max="20"
              value={attrDraft[key] ?? 5}
              onChange={(e) => setAttrDraft({ ...attrDraft, [key]: Number(e.target.value) })}
              disabled={!selected}
            />
          </label>
        ))}
        <button
          type="button"
          disabled={!selected}
          onClick={() =>
            void run(async () => {
              for (const key of ATTRIBUTE_KEYS) {
                await client.adminSetAttribute(token, selected, key, attrDraft[key] ?? 5);
              }
            }, t.admin.attributeSaved)
          }
        >
          {t.admin.attributeSaved}
        </button>
      </fieldset>

      <fieldset>
        <legend>{t.admin.vitals}</legend>
        <label>
          {t.admin.health}
          <input type="number" value={vitals.health} onChange={(e) => setVitals({ ...vitals, health: e.target.value })} />
        </label>
        <label>
          {t.admin.energy}
          <input type="number" value={vitals.energy} onChange={(e) => setVitals({ ...vitals, energy: e.target.value })} />
        </label>
        <label>
          {t.admin.reputation}
          <input
            type="number"
            value={vitals.reputation}
            onChange={(e) => setVitals({ ...vitals, reputation: e.target.value })}
          />
        </label>
        <button
          type="button"
          disabled={!selected}
          onClick={() =>
            void run(
              () =>
                client.adminAdjustVitals(token, selected, {
                  health: Number(vitals.health),
                  energy: Number(vitals.energy),
                  reputation: Number(vitals.reputation),
                }),
              t.admin.vitalsSaved,
            )
          }
        >
          {t.admin.vitals}
        </button>
      </fieldset>

      <h3>{t.admin.auditLog}</h3>
      <table className="kvt-admin-audit">
        <thead>
          <tr>
            <th scope="col">{t.admin.auditAction}</th>
            <th scope="col">{t.admin.auditActor}</th>
            <th scope="col">{t.admin.auditTarget}</th>
            <th scope="col">{t.admin.auditDetail}</th>
          </tr>
        </thead>
        <tbody>
          {audit.slice(0, 25).map((e) => (
            <tr key={e.id}>
              <td>{e.action}</td>
              <td>{e.actorId ?? "-"}</td>
              <td>{e.targetId ?? "-"}</td>
              <td>{e.detail ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
