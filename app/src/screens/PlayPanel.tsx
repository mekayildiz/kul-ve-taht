import { useCallback, useEffect, useState } from "react";
import type { Dictionary } from "../i18n";
import {
  ApiClient,
  ApiRequestError,
  type CharacterDto,
  type ItemDefDto,
  type PlayAction,
  type PlayStateDto,
  type RecipeDto,
} from "../api/client";

export interface PlayPanelProps {
  t: Dictionary;
  client: ApiClient;
  token: string;
  character: CharacterDto;
}

interface State {
  play: PlayStateDto | null;
  items: ItemDefDto[];
  recipes: RecipeDto[];
  sites: string[];
  message: string | null;
  error: string | null;
  loading: boolean;
}

const PROFESSIONS = ["farmer", "blacksmith", "hunter", "miner", "merchant", "healer", "soldier", "scholar", "craftsman"];

export function PlayPanel({ t, client, token, character }: PlayPanelProps): JSX.Element {
  const [state, setState] = useState<State>({
    play: null,
    items: [],
    recipes: [],
    sites: [],
    message: null,
    error: null,
    loading: true,
  });

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    client
      .playState(token, character.id)
      .then((res) => {
        setState({
          play: res.state,
          items: res.items,
          recipes: res.recipes,
          sites: res.explorationSites,
          message: null,
          error: null,
          loading: false,
        });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof ApiRequestError && error.code === "throttled" ? t.status.quotaLimited : t.status.offline;
        setState((prev) => ({ ...prev, error: message, loading: false }));
      });
  }, [client, token, character.id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    (action: PlayAction, successMessage: string) => {
      setState((prev) => ({ ...prev, error: null, message: null }));
      client
        .playAction(token, character.id, action)
        .then((res) => {
          setState((prev) => ({ ...prev, play: res.state, message: successMessage }));
        })
        .catch((error: unknown) => {
          const code = error instanceof ApiRequestError ? error.code : "unknown";
          const map: Record<string, string> = {
            not_enough_gold: t.play.errorNoGold,
            invalid_action: t.play.errorInvalid,
            unknown_item: t.play.errorUnknownItem,
            dead: t.play.errorDead,
          };
          setState((prev) => ({ ...prev, error: map[code] ?? t.auth.errorGeneric }));
        });
    },
    [client, token, character.id, t],
  );

  if (state.loading && !state.play) return <p>{t.status.loading}</p>;
  if (state.error && !state.play) {
    return (
      <p className="kvt-error" role="alert">
        {state.error}
      </p>
    );
  }
  if (!state.play) return <p>{t.status.offline}</p>;

  const play = state.play;
  const itemName = (id: string): string => state.items.find((i) => i.id === id)?.name ?? id;

  return (
    <section className="kvt-play">
      <h2>
        {character.given_name} {character.surname}
      </h2>

      <div className="kvt-vitals">
        <div>
          <strong>{play.health.health}</strong>
          <span>{t.play.health}</span>
        </div>
        <div>
          <strong>{play.health.hunger}</strong>
          <span>{t.play.hunger}</span>
        </div>
        <div>
          <strong>{play.health.fatigue}</strong>
          <span>{t.play.fatigue}</span>
        </div>
        <div>
          <strong>{play.gold}</strong>
          <span>{t.play.gold}</span>
        </div>
      </div>

      {!play.health.alive && (
        <p className="kvt-error" role="alert">
          {t.play.deadBanner}
        </p>
      )}

      {play.health.injuries.length > 0 && (
        <ul className="kvt-injuries">
          {play.health.injuries.map((inj) => (
            <li key={inj.id}>
              <span>
                {t.play.injury}: {inj.kind} ({inj.severity}) — {t.play.bleeding}: {inj.bleeding}
              </span>
              <button
                type="button"
                onClick={() => act({ action: "treat", injuryId: inj.id, method: "bandage", quality: 60 }, t.play.treated)}
              >
                {t.play.treat}
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.message && <p className="kvt-ok">{state.message}</p>}
      {state.error && (
        <p className="kvt-error" role="alert">
          {state.error}
        </p>
      )}

      <div className="kvt-playactions">
        <button type="button" onClick={() => act({ action: "rest", hours: 6 }, t.play.rested)} disabled={!play.health.alive}>
          {t.play.rest}
        </button>
        <button
          type="button"
          onClick={() => act({ action: "work", profession: PROFESSIONS[0]!, hours: 8 }, t.play.worked)}
          disabled={!play.health.alive}
        >
          {t.play.work}
        </button>
        {state.sites.slice(0, 3).map((site) => (
          <button
            key={site}
            type="button"
            onClick={() => act({ action: "explore", site, preparedness: 30 }, t.play.explored)}
            disabled={!play.health.alive}
          >
            {t.play.explore}: {site}
          </button>
        ))}
      </div>

      <h3>{t.play.inventory}</h3>
      <ul className="kvt-inventory">
        {play.inventory.map((entry) => (
          <li key={entry.itemId}>
            <span>
              {itemName(entry.itemId)} × {entry.quantity}
            </span>
            <button
              type="button"
              onClick={() => act({ action: "trade", itemId: entry.itemId, quantity: 1, side: "sell" }, t.play.sold)}
            >
              {t.play.sell}
            </button>
          </li>
        ))}
      </ul>

      <h3>{t.play.market}</h3>
      <ul className="kvt-market">
        {state.items.slice(0, 6).map((item) => (
          <li key={item.id}>
            <span>
              {item.name} — {item.baseValue} {t.play.gold}
            </span>
            <button
              type="button"
              onClick={() => act({ action: "trade", itemId: item.id, quantity: 1, side: "buy" }, t.play.bought)}
              disabled={!play.health.alive}
            >
              {t.play.buy}
            </button>
          </li>
        ))}
      </ul>

      <h3>{t.play.crafting}</h3>
      <ul className="kvt-recipes">
        {state.recipes.slice(0, 5).map((recipe) => (
          <li key={recipe.id}>
            <span>
              {itemName(recipe.output)} × {recipe.outputQuantity}
            </span>
            <button type="button" onClick={() => act({ action: "craft", recipeId: recipe.id }, t.play.crafted)}>
              {t.play.craft}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
