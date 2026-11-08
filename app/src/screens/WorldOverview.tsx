import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "../i18n";
import {
  ApiClient,
  ApiRequestError,
  type AssetCatalogDto,
  type SettlementDto,
  type WorldEventDto,
  type WorldSummaryDto,
  type WorldTimeDto,
} from "../api/client";

import { filterEvents, type EventToneFilter } from "./eventFilter";

export interface WorldOverviewProps {
  t: Dictionary;
  client: ApiClient;
}

interface State {
  summary: WorldSummaryDto | null;
  time: WorldTimeDto | null;
  settlements: SettlementDto[];
  events: WorldEventDto[];
  assets: AssetCatalogDto | null;
  error: string | null;
  loading: boolean;
}

export function WorldOverview({ t, client }: WorldOverviewProps): JSX.Element {
  const [state, setState] = useState<State>({
    summary: null,
    time: null,
    settlements: [],
    events: [],
    assets: null,
    error: null,
    loading: true,
  });
  const [kingdom, setKingdom] = useState<string>("");
  // Gunlukte arama ve ton suzgeci (belge 19): 20 olay arasinda kaybolmayi onler.
  const [eventQuery, setEventQuery] = useState<string>("");
  const [eventTone, setEventTone] = useState<EventToneFilter>("all");
  // Veri tasarrufu modu (belge 17.5): kucuk turev gorseller istenir.
  const [dataSaver, setDataSaver] = useState<boolean>(false);
  // Dunya saati ilerlediginde kisa sureli vurgu; "zaman akiyor" hissi verir.
  const [timeFlash, setTimeFlash] = useState<{ days: number; seasonChanged: boolean } | null>(null);
  const prevTimeRef = useRef<WorldTimeDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    Promise.all([
      client.worldSummary(),
      client.worldTime(),
      client.settlements(kingdom ? { kingdom } : {}),
      client.worldEvents({ limit: 20 }).catch(() => ({ events: [] })),
      client.assetCatalog().catch(() => ({ count: 0, assets: [], attributions: [] })),
    ])
      .then(([summary, time, settlements, events, assets]) => {
        if (cancelled) return;
        // Ilk yuklemede vurgu YOK; yalnizca sonraki ilerlemelerde gosterilir.
        const prev = prevTimeRef.current;
        const advanced = prev ? time.gameDay - prev.gameDay : 0;
        if (advanced > 0) {
          setTimeFlash({ days: advanced, seasonChanged: prev?.season !== time.season });
        }
        prevTimeRef.current = time;
        setState({
          summary,
          time,
          settlements: settlements.settlements,
          events: events.events,
          assets,
          error: null,
          loading: false,
        });
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

  // Vurgu kalici kalmasin: animasyon bitince durumu temizle.
  useEffect(() => {
    if (!timeFlash) return;
    const timer = setTimeout(() => setTimeFlash(null), 6000);
    return () => clearTimeout(timer);
  }, [timeFlash]);

  if (state.loading && !state.summary) return <p>{t.status.loading}</p>;
  if (state.error && !state.summary) {
    return (
      <p className="kvt-error" role="alert">
        {state.error}
      </p>
    );
  }

  // Gunluk suzgeci: metin + ton birlikte uygulanir; siralama korunur.
  const visibleEvents = filterEvents({ events: state.events, query: eventQuery, tone: eventTone });

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
        <p className={`kvt-clock${timeFlash ? " kvt-clock-flash" : ""}`}>
          {t.world.gameTime}: {t.world.year} {state.time.gameYear}, {t.world.day} {state.time.gameDay} —{" "}
          {t.seasons[state.time.season]}
          {timeFlash && (
            <span className="kvt-timeflash" role="status">
              {t.world.timeAdvanced(timeFlash.days)}
              {timeFlash.seasonChanged ? ` · ${t.world.seasonChanged(t.seasons[state.time.season])}` : ""}
            </span>
          )}
        </p>
      )}

      <section className="kvt-eventlog" aria-label={t.world.eventLog}>
        <h3>{t.world.eventLog}</h3>
        <div className="kvt-eventlog-tools">
          <label className="kvt-eventlog-search">
            <span className="kvt-sr-only">{t.world.search}</span>
            <input
              type="search"
              value={eventQuery}
              placeholder={t.world.searchPlaceholder}
              onChange={(e) => setEventQuery(e.target.value)}
            />
          </label>
          <div className="kvt-eventlog-tones" role="group" aria-label={t.world.search}>
            {(["all", "bad", "good", "neutral"] as const).map((tone) => (
              <button
                key={tone}
                type="button"
                className={`kvt-tone-chip${eventTone === tone ? " kvt-tone-chip-active" : ""}`}
                aria-pressed={eventTone === tone}
                onClick={() => setEventTone(tone)}
              >
                {tone === "all"
                  ? t.world.filterAll
                  : tone === "bad"
                    ? t.world.filterBad
                    : tone === "good"
                      ? t.world.filterGood
                      : t.world.filterNeutral}
              </button>
            ))}
          </div>
        </div>
        {state.events.length === 0 ? (
          <p className="kvt-eventlog-empty">{t.world.eventLogEmpty}</p>
        ) : visibleEvents.length === 0 ? (
          <p className="kvt-eventlog-empty">{t.world.searchEmpty}</p>
        ) : (
          <ul>
            {visibleEvents.map((e) => (
              <li key={e.id} className={`kvt-event kvt-event-${e.tone}`}>
                <span className="kvt-event-day">
                  {t.world.day} {e.gameDay}
                </span>
                <span className="kvt-event-title">{e.title}</span>
                {e.settlementName && <span className="kvt-event-place">{e.settlementName}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

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
                <span className="kvt-assetfile">{dataSaver ? a.thumbnailPath ?? a.assetPath : a.assetPath}</span>
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
