import { useEffect, useState } from "react";
import type { Dictionary } from "../i18n";
import {
  ApiClient,
  ApiRequestError,
  type AssetCatalogDto,
  type SettlementDto,
  type WorldSummaryDto,
  type WorldTimeDto,
} from "../api/client";

export interface WorldOverviewProps {
  t: Dictionary;
  client: ApiClient;
}

interface State {
  summary: WorldSummaryDto | null;
  time: WorldTimeDto | null;
  settlements: SettlementDto[];
  assets: AssetCatalogDto | null;
  error: string | null;
  loading: boolean;
}

export function WorldOverview({ t, client }: WorldOverviewProps): JSX.Element {
  const [state, setState] = useState<State>({
    summary: null,
    time: null,
    settlements: [],
    assets: null,
    error: null,
    loading: true,
  });
  const [kingdom, setKingdom] = useState<string>("");
  // Veri tasarrufu modu (belge 17.5): kucuk turev gorseller istenir.
  const [dataSaver, setDataSaver] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    Promise.all([
      client.worldSummary(),
      client.worldTime(),
      client.settlements(kingdom ? { kingdom } : {}),
      client.assetCatalog().catch(() => ({ count: 0, assets: [], attributions: [] })),
    ])
      .then(([summary, time, settlements, assets]) => {
        if (cancelled) return;
        setState({ summary, time, settlements: settlements.settlements, assets, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiRequestError && error.code === "throttled" ? t.status.quotaLimited : t.status.offline;
        setState((prev) => ({ ...prev, error: message, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [client, kingdom, t]);

  if (state.loading && !state.summary) return <p>{t.status.loading}</p>;
  if (state.error && !state.summary) {
    return (
      <p className="kvt-error" role="alert">
        {state.error}
      </p>
    );
  }

  return (
    <section className="kvt-world">
      <div className="kvt-stats">
        <div>
          <strong>{state.summary?.kingdoms ?? 0}</strong>
          <span>{t.world.kingdoms}</span>
        </div>
        <div>
          <strong>{state.summary?.freeCities ?? 0}</strong>
          <span>{t.world.freeCities}</span>
        </div>
        <div>
          <strong>{state.summary?.neutralZones ?? 0}</strong>
          <span>{t.world.neutralZones}</span>
        </div>
        <div>
          <strong>
            {state.summary?.settlements ?? 0}/{state.summary?.settlementsTarget ?? 130}
          </strong>
          <span>{t.world.settlements}</span>
        </div>
      </div>

      {state.time && (
        <p className="kvt-clock">
          {t.world.gameTime}: {t.world.year} {state.time.gameYear}, {t.world.day} {state.time.gameDay} —{" "}
          {t.seasons[state.time.season]}
        </p>
      )}

      <label className="kvt-filter">
        {t.world.kingdoms}
        <select value={kingdom} onChange={(e) => setKingdom(e.target.value)}>
          <option value="">—</option>
          {["varkhenn", "aurelith", "solmerya", "eryndor", "caelvar"].map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>

      <p className="kvt-count">
        {t.world.settlements}: {state.settlements.length}
      </p>
      <ul className="kvt-settlementlist">
        {state.settlements.slice(0, 30).map((s) => (
          <li key={s.id}>
            <span className={`kvt-kind kvt-kind-${s.kind}`}>{t.kinds[s.kind]}</span>
            <span className="kvt-sname">{s.name}</span>
            <span className="kvt-sout">{s.primaryOutput}</span>
          </li>
        ))}
      </ul>

      {state.assets && state.assets.assets.length > 0 && (
        <section className="kvt-assets" aria-label={t.world.assets}>
          <div className="kvt-assets-head">
            <h3>{t.world.assets}</h3>
            <label className="kvt-datasaver">
              <input type="checkbox" checked={dataSaver} onChange={(e) => setDataSaver(e.target.checked)} />
              {t.world.dataSaver}
            </label>
          </div>
          <ul className="kvt-assetlist">
            {state.assets.assets.slice(0, 24).map((a) => (
              <li key={a.assetKey} className="kvt-asset">
                <span className={`kvt-asseticon kvt-asset-${a.category}`} aria-hidden="true">
                  ▣
                </span>
                <span className="kvt-assetname">{a.assetKey}</span>
                <span className="kvt-assetlicense">{a.license}</span>
                <span className="kvt-assetfile">{dataSaver ? a.thumbnailKey ?? a.r2Key : a.r2Key}</span>
              </li>
            ))}
          </ul>
          {state.assets.attributions.length > 0 && (
            <ul className="kvt-attributions" aria-label={t.world.attributions}>
              {state.assets.attributions.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
