import { useCallback, useEffect, useState } from "react";
import type { Dictionary } from "../i18n";
import { ApiClient, ApiRequestError, type CharacterDto, type SettlementDto } from "../api/client";

export interface BirthplacePanelDto {
  settlementId: string;
  name: string;
  kind: SettlementDto["kind"];
  kingdomName: string;
  geography: string;
  climate: string;
  economy: string;
  politicalSituation: string;
  militarySituation: string;
  socialStructure: string;
  opportunities: string[];
  advantages: string[];
  disadvantages: string[];
}

export interface CharacterSetupProps {
  t: Dictionary;
  client: ApiClient;
  token: string;
  onCreated: (character: CharacterDto) => void;
}

const KINGDOMS = ["varkhenn", "aurelith", "solmerya", "eryndor", "caelvar"];
const BASE_ATTRIBUTES: Record<string, number> = {
  strength: 8, endurance: 8, agility: 8, intellect: 8, perception: 8, charisma: 8, leadership: 8,
};

/** Karakter olusturma: dogum yeri karsilastirmali bilgi paneli ile secilir (belge 5.1). */
export function CharacterSetup({ t, client, token, onCreated }: CharacterSetupProps): JSX.Element {
  const [givenName, setGivenName] = useState("");
  const [surname, setSurname] = useState("");
  const [kingdom, setKingdom] = useState(KINGDOMS[0]!);
  const [settlements, setSettlements] = useState<SettlementDto[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<BirthplacePanelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client.settlements({ kingdom }).then((res) => setSettlements(res.settlements)).catch(() => setSettlements([]));
  }, [client, kingdom]);

  const pickSettlement = useCallback(
    (id: string) => {
      setSelected(id);
      client
        .birthplace(id)
        .then(setPanel)
        .catch(() => setPanel(null));
    },
    [client],
  );

  const submit = useCallback(() => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    client
      .createCharacter(token, { givenName, surname, birthSettlement: selected, attributes: BASE_ATTRIBUTES })
      .then((res) => {
        onCreated({
          id: res.characterId,
          given_name: givenName,
          surname,
          birth_settlement: selected,
          current_settlement: selected,
          age_years: 16,
          generation: 1,
        });
      })
      .catch((err: unknown) => {
        const code = err instanceof ApiRequestError ? err.code : "unknown";
        setError(code === "invalid_birth_settlement" ? t.setup.errorBirthplace : t.auth.errorGeneric);
        setBusy(false);
      });
  }, [client, token, givenName, surname, selected, onCreated, t]);

  return (
    <section className="kvt-setup">
      <h2>{t.setup.title}</h2>

      <label>
        {t.setup.givenName}
        <input value={givenName} onChange={(e) => setGivenName(e.target.value)} />
      </label>
      <label>
        {t.setup.surname}
        <input value={surname} onChange={(e) => setSurname(e.target.value)} />
      </label>

      <label>
        {t.setup.kingdom}
        <select value={kingdom} onChange={(e) => { setKingdom(e.target.value); setSelected(null); setPanel(null); }}>
          {KINGDOMS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>

      <ul className="kvt-settlements">
        {settlements.map((s) => (
          <li key={s.id}>
            <button type="button" className={selected === s.id ? "kvt-selected" : ""} onClick={() => pickSettlement(s.id)}>
              <span className={`kvt-kind kvt-kind-${s.kind}`}>{t.kinds[s.kind]}</span> {s.name}
            </button>
          </li>
        ))}
      </ul>

      {panel && (
        <div className="kvt-panel">
          <h3>{panel.name}</h3>
          <p>{t.setup.geography}: {panel.geography}</p>
          <p>{t.setup.climate}: {panel.climate}</p>
          <p>{t.setup.economy}: {panel.economy}</p>
          <p>{t.setup.political}: {panel.politicalSituation}</p>
          <p>{t.setup.military}: {panel.militarySituation}</p>
          <p>{t.setup.social}: {panel.socialStructure}</p>
          <p>{t.setup.opportunities}: {panel.opportunities.join(", ")}</p>
          <p className="kvt-ok">{t.setup.advantages}: {panel.advantages.join(", ")}</p>
          <p className="kvt-error">{t.setup.disadvantages}: {panel.disadvantages.join(", ")}</p>
        </div>
      )}

      {error && (
        <p className="kvt-error" role="alert">
          {error}
        </p>
      )}

      <button type="button" onClick={submit} disabled={!selected || givenName.length < 2 || surname.length < 2 || busy}>
        {t.setup.create}
      </button>
    </section>
  );
}
