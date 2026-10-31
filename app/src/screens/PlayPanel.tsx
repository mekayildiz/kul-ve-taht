import { useCallback, useEffect, useState } from "react";
import type { Dictionary } from "../i18n";
import {
  ApiClient,
  ApiRequestError,
  type CatalogDto,
  type CharacterDto,
  type DiplomacyDto,
  type ItemDefDto,
  type OfficeDto,
  type PlayAction,
  type PlayStateDto,
  type PrisonDto,
  type PropertyDto,
  type RecipeDto,
  type ShipDto,
  type SocialDto,
  type UnitDto,
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
  catalog: CatalogDto | null;
  units: UnitDto[];
  ships: ShipDto[];
  properties: PropertyDto[];
  prison: PrisonDto | null;
  social: SocialDto[];
  office: OfficeDto | null;
  diplomacy: DiplomacyDto[];
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
    catalog: null,
    units: [],
    ships: [],
    properties: [],
    prison: null,
    social: [],
    office: null,
    diplomacy: [],
    message: null,
    error: null,
    loading: true,
  });

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    Promise.all([client.playState(token, character.id), client.catalog().catch(() => null)])
      .then(([res, catalog]) => {
        setState({
          play: res.state,
          items: res.items,
          recipes: res.recipes,
          sites: res.explorationSites,
          catalog,
          units: res.units,
          ships: res.ships,
          properties: res.properties,
          prison: res.prison,
          social: res.social,
          office: res.office,
          diplomacy: res.diplomacy,
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
        .then(() => {
          setState((prev) => ({ ...prev, message: successMessage }));
          load();
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

      {state.catalog && (
        <>
          <h3>
            {t.play.farm} · {t.play.magic} ({t.play.magicLevel}: {play.magicLevel}, {t.play.energy}: {play.energy})
          </h3>
          <ul className="kvt-farm">
            {state.catalog.crops.slice(0, 4).map((crop) => (
              <li key={crop.id}>
                <span>{crop.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    act({ action: "plant", crop: crop.id, season: crop.season, weather: "clear" }, t.play.planted)
                  }
                  disabled={!play.health.alive}
                >
                  {t.play.plant}
                </button>
              </li>
            ))}
            <li>
              <span>{t.play.harvest}</span>
              <button type="button" onClick={() => act({ action: "harvest" }, t.play.harvested)} disabled={!play.health.alive}>
                {t.play.harvest}
              </button>
            </li>
          </ul>

          <h3>{t.play.hunt}</h3>
          <ul className="kvt-hunt">
            {state.catalog.animals.map((animal) => (
              <li key={animal.id}>
                <span>{animal.name}</span>
                <button
                  type="button"
                  onClick={() => act({ action: "hunt", animal: animal.id, preparedness: 40 }, t.play.hunted)}
                  disabled={!play.health.alive}
                >
                  {t.play.hunt}
                </button>
                <button
                  type="button"
                  onClick={() => act({ action: "tame", animal: animal.id }, t.play.tamed)}
                  disabled={!play.health.alive}
                >
                  {t.play.tame}
                </button>
              </li>
            ))}
          </ul>

          <h3>{t.play.magic}</h3>
          <ul className="kvt-magic">
            {state.catalog.magicPaths.map((path) => (
              <li key={path.id}>
                <span>{path.name}</span>
                <button type="button" onClick={() => act({ action: "learnSpell", path: path.id }, t.play.learned)}>
                  {t.play.learnSpell}
                </button>
              </li>
            ))}
            {state.catalog.spells.slice(0, 4).map((spell) => (
              <li key={spell.id}>
                <span>
                  {spell.name} (L{spell.level})
                </span>
                <button
                  type="button"
                  onClick={() => act({ action: "castSpell", spellId: spell.id }, t.play.cast)}
                  disabled={!play.health.alive}
                >
                  {t.play.castSpell}
                </button>
              </li>
            ))}
          </ul>

          <h3>{t.play.temple}</h3>
          <ul className="kvt-temple">
            {state.catalog.templeServices.map((svc) => (
              <li key={svc.service}>
                <span>
                  {svc.service} — {svc.cost} {t.play.gold}
                </span>
                <button
                  type="button"
                  onClick={() => act({ action: "temple", service: svc.service as "healing" }, t.play.served)}
                >
                  {t.play.temple}
                </button>
              </li>
            ))}
          </ul>

          <h3>{t.play.guild}</h3>
          <ul className="kvt-guild">
            {state.catalog.guilds.map((guild) => (
              <li key={guild.id}>
                <span>
                  {guild.name} — {guild.dues} {t.play.gold}
                </span>
                <button type="button" onClick={() => act({ action: "joinGuild", guildId: guild.id }, t.play.joined)}>
                  {t.play.joinGuild}
                </button>
              </li>
            ))}
          </ul>

          <h3>{t.play.activities}</h3>
          <ul className="kvt-activities">
            {state.catalog.activities.map((activity) => (
              <li key={activity.kind}>
                <span>
                  {activity.name} — {activity.cost} {t.play.gold}
                </span>
                <button
                  type="button"
                  onClick={() => act({ action: "activity", kind: activity.kind }, t.play.committed)}
                  disabled={!play.health.alive}
                >
                  {t.play.activities}
                </button>
              </li>
            ))}
          </ul>

          <h3>{t.play.underworld}</h3>
          <ul className="kvt-underworld">
            {state.catalog.underworldActions.map((ua) => (
              <li key={ua.action}>
                <span>{ua.name}</span>
                <button
                  type="button"
                  onClick={() => act({ action: "underworld", underworldAction: ua.action, security: 50 }, t.play.committed)}
                  disabled={!play.health.alive}
                >
                  {t.play.underworld}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Belge 20: askeri, ekonomi, adalet, dovus, sosyal ve siyaset sistemleri. */}
      <h3>{t.play.military}</h3>
      {state.prison && (
        <p className="kvt-error" role="alert">
          {t.play.prison}: {state.prison.daysRemaining} {t.play.prisonDays}
        </p>
      )}
      <ul className="kvt-units">
        {state.units.map((unit) => (
          <li key={unit.id}>
            <span>
              {unit.unitType} × {unit.strength} — {t.play.morale}: {unit.morale}, {t.play.supply}: {unit.supply}
            </span>
          </li>
        ))}
      </ul>
      <div className="kvt-playactions">
        <button
          type="button"
          onClick={() => act({ action: "recruit", unitType: "infantry", strength: 10 }, t.play.committed)}
          disabled={!play.health.alive}
        >
          {t.play.recruit}
        </button>
        <button type="button" onClick={() => act({ action: "resupply" }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.resupply}
        </button>
        <button type="button" onClick={() => act({ action: "battle", terrain: "open" }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.battle}
        </button>
        <button type="button" onClick={() => act({ action: "siege", siegeEngines: 10 }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.siege}
        </button>
        <button type="button" onClick={() => act({ action: "buildShip", shipClass: "galley" }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.buildShip}
        </button>
        <button type="button" onClick={() => act({ action: "navalBattle" }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.navalBattle}
        </button>
      </div>
      {state.ships.length > 0 && (
        <ul className="kvt-ships">
          {state.ships.map((ship) => (
            <li key={ship.id}>
              <span>
                {ship.shipClass} — {ship.condition}%
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3>
        {t.play.economy} — {t.play.debts}: {play.debts}
      </h3>
      <ul className="kvt-properties">
        {state.properties.map((prop) => (
          <li key={prop.id}>
            <span>
              {prop.propertyType} — {prop.value} {t.play.gold}
            </span>
          </li>
        ))}
      </ul>
      <div className="kvt-playactions">
        <button type="button" onClick={() => act({ action: "takeLoan", amount: 100 }, t.play.committed)}>
          {t.play.takeLoan}
        </button>
        <button type="button" onClick={() => act({ action: "repayLoan" }, t.play.committed)}>
          {t.play.repayLoan}
        </button>
        <button type="button" onClick={() => act({ action: "buyProperty", propertyType: "business" }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.buyProperty}
        </button>
        <button type="button" onClick={() => act({ action: "runBusiness" }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.runBusiness}
        </button>
        <button type="button" onClick={() => act({ action: "payTaxes" }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.payTaxes}
        </button>
      </div>

      <h3>{t.play.justice}</h3>
      <div className="kvt-playactions">
        <button type="button" onClick={() => act({ action: "crime", crimeType: "theft", evidence: 20 }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.crime}
        </button>
        <button type="button" onClick={() => act({ action: "escape", bribe: 0 }, t.play.committed)}>
          {t.play.escape}
        </button>
      </div>

      <h3>{t.play.combat}</h3>
      <div className="kvt-playactions">
        <button type="button" onClick={() => act({ action: "fight", opponentStrength: 8 }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.fight}
        </button>
        <button type="button" onClick={() => act({ action: "duel", consented: true, opponentStrength: 8 }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.duel}
        </button>
      </div>

      <h3>{t.play.social}</h3>
      {state.social.length === 0 && <p>{t.play.socialEmpty}</p>}
      <ul className="kvt-social">
        {state.social.map((s) => (
          <li key={`${s.targetId}-${s.kind}`}>
            <span>
              {s.targetId} — {s.kind}
            </span>
          </li>
        ))}
      </ul>
      <div className="kvt-playactions">
        <button type="button" onClick={() => act({ action: "setRelationship", targetId: "npc-1", kind: "friend" }, t.play.committed)}>
          {t.play.addFriend}
        </button>
      </div>

      <h3>
        {t.play.politics} — {t.play.office}: {state.office ? `${state.office.title} (${state.office.rank})` : t.play.none}
      </h3>
      <ul className="kvt-diplomacy">
        {state.diplomacy.map((d) => (
          <li key={d.from}>
            <span>
              {d.from} — {t.play.stance}: {d.stance}
            </span>
            <button type="button" onClick={() => act({ action: "diplomacy", kingdomId: d.from, diplomacyAction: "gift" }, t.play.committed)}>
              {t.play.sendGift}
            </button>
          </li>
        ))}
      </ul>
      <div className="kvt-playactions">
        <button type="button" onClick={() => act({ action: "seekOffice", title: "Memur" }, t.play.committed)}>
          {t.play.seekOffice}
        </button>
      </div>
    </section>
  );
}
