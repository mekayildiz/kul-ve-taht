import { useCallback, useEffect, useState } from "react";
import type { Dictionary } from "../i18n";
import { CharacterAvatar } from "../components/CharacterAvatar";
import { ToastStack, type ToastItem } from "../components/Toast";
import { describeOutcome, outcomeSummary, type OutcomeLine } from "./playOutcome";
import { describeAbsence } from "./absenceReport";
import { nextGoal } from "./nextGoal";
import { progressionBars } from "./progression";
import { playSound, setSoundEnabled, soundEnabled, soundForOutcome } from "../components/sound";
import {
  firstSteps,
  firstStepsComplete,
  loadStepProgress,
  saveStepProgress,
  stepSignalForAction,
  type StepProgress,
} from "./firstSteps";
import {
  achievementInputFrom,
  achievementSummary,
  achievementsFor,
  loadSeenAchievements,
  newlyUnlocked,
  saveSeenAchievements,
} from "./achievements";
import { groupNotifications, unreadTotal } from "./notificationGroups";
import { actionErrorText } from "./actionError";
import { castHint, learnHint, tameHint } from "./actionHints";
import {
  ApiClient,
  ApiRequestError,
  type AbsenceReportDto,
  type AuctionDto,
  type CatalogDto,
  type CharacterDto,
  type ChatMessageDto,
  type DiplomacyDto,
  type AppearanceDto,
  type BankAccountDto,
  type CompanyDto,
  type EscrowDto,
  type RentalDto,
  type TitleDisputeDto,
  type TradeOfferDto,
  type AllianceDto,
  type ChildDto,
  type KingdomRelationDto,
  type MotionDto,
  type NotificationDigestDto,
  type FamilyDto,
  type GroupDto,
  type StorageDto,
  type ItemDefDto,
  type MarketQuoteDto,
  type OfficeDto,
  type PeerLoanDto,
  type PlayAction,
  type PlayerSummaryDto,
  type PersonalityDto,
  type PlayStateDto,
  type PrisonDto,
  type PropertyDto,
  type QuestCatalogEntryDto,
  type QuestLogEntryDto,
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
  family: FamilyDto | null;
  group: GroupDto | null;
  appearance: AppearanceDto | null;
  bank: BankAccountDto[];
  escrows: EscrowDto[];
  peerLoans: PeerLoanDto[];
  companies: CompanyDto[];
  rentals: RentalDto[];
  titleDisputes: TitleDisputeDto[];
  trades: TradeOfferDto[];
  alliance: AllianceDto | null;
  children: ChildDto[];
  relations: KingdomRelationDto[];
  motions: MotionDto[];
  notifications: NotificationDigestDto | null;
  storage: StorageDto | null;
  diplomacy: DiplomacyDto[];
  directory: PlayerSummaryDto[];
  personality: PersonalityDto;
  heir: string | null;
  kingdomId: string;
  target: string;
  dataSaver: boolean;
  quests: QuestLogEntryDto[];
  questCatalog: QuestCatalogEntryDto[];
  auctions: AuctionDto[];
  marketQuote: MarketQuoteDto | null;
  chat: ChatMessageDto[];
  chatDraft: string;
  message: string | null;
  error: string | null;
  loading: boolean;
}

const PROFESSIONS = ["farmer", "blacksmith", "hunter", "miner", "merchant", "healer", "soldier", "scholar", "craftsman"];

// Statik gorsel varliklar (belge 17.4): Cloudflare Pages /assets/... yolundan sunar.
// Esya kategorisi -> ikon eslemesi; haritada olmayanlar icin 'gold' ikonu kullanilir.
const ASSET_BASE = "/assets";
const CATEGORY_ICON: Record<string, string> = {
  weapon: "sword",
  armor: "shield",
  food: "heart",
  medicine: "heart",
  material: "gold",
  luxury: "gold",
  mount: "horse",
  book: "scroll",
};
function iconForCategory(category: string | undefined): string {
  return CATEGORY_ICON[category ?? ""] ?? "gold";
}
function iconSrc(icon: string, dataSaver: boolean): string {
  return `${ASSET_BASE}/icons/${icon}${dataSaver ? "-64" : ""}.webp`;
}

const PERSONALITY_KEYS: (keyof PersonalityDto)[] = [
  "courage",
  "mercy",
  "ambition",
  "loyalty",
  "discipline",
  "patience",
];

/** Oynanis sekmeleri: uzun sayfa yerine kategorili/alt baslikli gezinme. */
type PlayTab = "durum" | "hayat" | "dunya" | "ekonomi" | "guc" | "siyaset";
const PLAY_TABS: PlayTab[] = ["durum", "hayat", "dunya", "ekonomi", "guc", "siyaset"];

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
    family: null,
    group: null,
    appearance: null,
    bank: [],
    escrows: [],
    peerLoans: [],
    companies: [],
    rentals: [],
    titleDisputes: [],
    trades: [],
    alliance: null,
    children: [],
    relations: [],
    motions: [],
    notifications: null,
    storage: null,
    diplomacy: [],
    directory: [],
    personality: { courage: 50, mercy: 50, ambition: 50, loyalty: 50, discipline: 50, patience: 50 },
    heir: null,
    kingdomId: "varkhenn",
    target: "",
    dataSaver: false,
    quests: [],
    questCatalog: [],
    auctions: [],
    marketQuote: null,
    chat: [],
    chatDraft: "",
    message: null,
    error: null,
    loading: true,
  });
  const [tab, setTab] = useState<PlayTab>("durum");
  // Av/kesif hazirlik ve yeralti guvenlik secimi oyuncuya birakilir (belge 12.3).
  const [preparedness, setPreparedness] = useState(40);
  const [security, setSecurity] = useState(50);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [lastOutcome, setLastOutcome] = useState<{ lines: OutcomeLine[]; at: number } | null>(null);
  const [absence, setAbsence] = useState<AbsenceReportDto | null>(null);
  const [sound, setSound] = useState<boolean>(() => soundEnabled());
  const [stepProgress, setStepProgress] = useState<StepProgress>(() => loadStepProgress(character.id));
  const [guideHidden, setGuideHidden] = useState(false);
  const [seenAchievements, setSeenAchievements] = useState<string[]>(() => loadSeenAchievements(character.id));
  const [showSummary, setShowSummary] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Rehber ilerlemesini kalici kil (sayfa yenilense de kaybolmasin).
  useEffect(() => {
    saveStepProgress(character.id, stepProgress);
  }, [character.id, stepProgress]);

  const toggleSound = useCallback(() => {
    setSound((prev) => {
      const next = !prev;
      setSoundEnabled(next);
      // Acilirken hemen bir ornek ton: oyuncu sesin geldigini duyar.
      if (next) playSound("success");
      return next;
    });
  }, []);

  // Islem bildirimleri sayfa ustunde birikmez; kisa omurlu balon olarak gosterilir.
  const notify = useCallback((kind: "ok" | "error", text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000);
  }, []);

  // Yeni acilan basarimlari bir kez kutla (belge 19).
  useEffect(() => {
    if (!state.play) return;
    const unlocked = newlyUnlocked(seenAchievements, achievementsFor(achievementInputFrom(state)));
    if (unlocked.length === 0) return;
    for (const id of unlocked) notify("ok", `${t.play.achievementUnlocked}: ${t.play.achievementNames[id]}`);
    playSound("levelup");
    const next = [...seenAchievements, ...unlocked];
    setSeenAchievements(next);
    saveSeenAchievements(character.id, next);
  }, [state, seenAchievements, character.id, t, notify]);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    Promise.all([
      client.playState(token, character.id),
      client.catalog().catch(() => null),
      client.chat(token, "global").catch(() => null),
      client.quests(token, character.id).catch(() => null),
      client.auctions().catch(() => null),
      client.notifications(token).catch(() => null),
    ])
      .then(([res, catalog, chat, quests, auctions, notifications]) => {
        // Yokluk raporu yalnizca donusten sonraki ILK yanitta dolu gelir;
        // sonraki yuklemelerde null olur. Bu yuzden null ile UZERINE YAZMA.
        if (res.absence) setAbsence(res.absence);
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
          family: res.family,
          group: res.group,
          appearance: res.appearance,
          bank: res.bank,
          escrows: res.escrows,
          peerLoans: res.peerLoans ?? [],
          companies: res.companies,
          rentals: res.rentals,
          titleDisputes: res.titleDisputes,
          trades: res.trades,
          alliance: res.alliance,
          children: res.children,
          relations: res.relations,
          motions: res.motions,
          notifications,
          storage: res.storage,
          diplomacy: res.diplomacy,
          directory: res.directory ?? [],
          personality: res.personality ?? { courage: 50, mercy: 50, ambition: 50, loyalty: 50, discipline: 50, patience: 50 },
          heir: res.heir ?? null,
          kingdomId: res.kingdomId ?? character.current_settlement?.split("-")[0] ?? "varkhenn",
          quests: quests?.log ?? [],
          questCatalog: quests?.catalog ?? [],
          auctions: auctions?.auctions ?? [],
          marketQuote: null,
          chat: chat?.messages ?? [],
          chatDraft: "",
          message: null,
          error: null,
          loading: false,
          target: "",
          dataSaver: false,
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
      const before = state.play;
      client
        .playAction(token, character.id, action)
        .then((res) => {
          // Sunucu yeni tam durumu dondurur; onceki durumla farkini gostererek
          // gercek geri bildirim uret (altin, saglik, ganimet, yara...).
          const lines = before ? describeOutcome(t, before, res.state, res.detail) : [];
          if (lines.length > 0) {
            setLastOutcome({ lines, at: Date.now() });
            notify("ok", outcomeSummary(t, lines));
          } else {
            notify("ok", successMessage);
          }
          // Sesli geri bildirim (belge 19): once seviye atlama, sonra sonuc tonu.
          const after = progressionBars(res.state);
          const leveledUp = before ? after.some((bar, i) => bar.level > progressionBars(before)[i]!.level) : false;
          if (leveledUp) playSound("levelup");
          else if (lines.length > 0) playSound(soundForOutcome(lines.map((l) => l.tone)));
          else playSound("success");
          // Rehber ilerlemesi: ilk aksiyon her zaman, kesif/av ise turune gore.
          const signal = stepSignalForAction(action.action);
          setStepProgress((prev) => ({
            acted: true,
            explored: prev.explored || signal === "explored",
          }));
          load();
        })
        .catch((error: unknown) => {
          // Sunucu "reason" alt nedenini gonderir; aciklama istemcide uretilir.
          const text = actionErrorText(error, t);
          notify("error", text.unknownReason ? `${text.message} (${text.unknownReason})` : text.message);
          playSound("error");
        });
    },
    [client, token, character.id, t, notify, load, state.play],
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
  // Katalog alanlari JSX kapanislarinda da kullanilir; burada bir kez oku.
  const magicTraining = state.catalog?.magicTraining;
  const itemName = (id: string): string => state.items.find((i) => i.id === id)?.name ?? id;
  const itemCategory = (id: string): string | undefined => state.items.find((i) => i.id === id)?.category;
  // Ilk adimlar rehberi (belge 19): gozlemlenebilir durumdan turetilir.
  const bars = progressionBars(play);
  const steps = firstSteps({
    hasActed: stepProgress.acted,
    hasEarnedGold: play.gold > 20,
    hasTravelled: (character.current_settlement ?? character.birth_settlement) !== character.birth_settlement,
    hasExplored: stepProgress.explored,
    hasQuest: state.quests.length > 0,
    progressionPoints: play.weaponMastery + play.reputation + play.underworldRep,
  });
  const guideComplete = firstStepsComplete(steps);
  // Rehber tamamlaninca kendiliginden kaybolur; oyuncu erken de gizleyebilir.
  const showGuide = !guideHidden && !guideComplete;
  // Bildirim ozeti eksik/bozuk gelebilir (uc nokta istege bagli); guvenli oku.
  const notifVisible = Array.isArray(state.notifications?.visible) ? state.notifications.visible : [];
  // Bildirimler gruba ayrilir (belge 19): onemli olan gurultuden ayrilir.
  const notifGroups = groupNotifications(notifVisible);
  const notifUnread = unreadTotal(notifVisible);
  // Basarimlar durumdan turetilir; sunucuda kayit yok (belge 19).
  const achievements = achievementsFor(achievementInputFrom(state));
  const achSummary = achievementSummary(achievements);
  const appearance: AppearanceDto | null = state.appearance ?? null;

  return (
    <section className="kvt-play">
      <div className="kvt-playhead">
        <CharacterAvatar
          appearance={appearance}
          seed={character.id}
          size={72}
          className="kvt-avatar-lg"
          title={`${t.play.portrait}: ${character.given_name}`}
        />
        <div>
          <h2>
            {character.given_name} {character.surname}
          </h2>
          <span className="kvt-where">{character.current_settlement ?? character.birth_settlement}</span>
        </div>
        <button
          type="button"
          className="kvt-summary-open"
          onClick={() => setShowSummary(true)}
        >
          {t.play.summaryOpen}
        </button>
        <button
          type="button"
          className="kvt-sound-toggle"
          aria-pressed={sound}
          title={sound ? t.play.soundOn : t.play.soundOff}
          onClick={toggleSound}
        >
          {sound ? "🔊" : "🔇"} {t.play.sound}
        </button>
      </div>

      {showSummary && (
        <section className="kvt-summary" role="dialog" aria-label={t.play.summaryTitle}>
          <div className="kvt-summary-head">
            <h3>{t.play.summaryTitle}</h3>
            <button type="button" className="kvt-summary-close" onClick={() => setShowSummary(false)}>
              {t.play.summaryClose}
            </button>
          </div>
          <p className="kvt-summary-intro">{t.play.summaryIntro}</p>
          <dl className="kvt-summary-groups">
            {(["hayattaKal", "kazan", "kesfet", "yuksel", "sosyal"] as const).map((group) => (
              <div key={group} className="kvt-summary-group">
                <dt>{t.play.summaryGroups[group]}</dt>
                <dd>{t.play.summaryItems[group]}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <nav className="kvt-tabs" aria-label={t.play.tabsLabel}>
        {PLAY_TABS.map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "kvt-tab kvt-tab-active" : "kvt-tab"}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {t.play.tabs[key]}
          </button>
        ))}
      </nav>

      <ToastStack items={toasts} />

      {tab === "durum" && showGuide && (
        <section className="kvt-guide" aria-label={t.play.guideTitle}>
          <div className="kvt-guide-head">
            <h3>{t.play.guideTitle}</h3>
            <button type="button" className="kvt-guide-hide" onClick={() => setGuideHidden(true)}>
              {t.play.guideHide}
            </button>
          </div>
          <ol>
            {steps.map((step) => (
              <li
                key={step.id}
                className={`kvt-guide-step${step.done ? " kvt-guide-done" : ""}${step.current ? " kvt-guide-current" : ""}`}
              >
                <span className="kvt-guide-mark" aria-hidden="true">
                  {step.done ? "✓" : step.current ? "▸" : "·"}
                </span>
                <span>{t.play.guideSteps[step.id]}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {tab === "durum" && (
        <section className="kvt-achv" aria-label={t.play.achievements}>
          <div className="kvt-achv-head">
            <h3>{t.play.achievements}</h3>
            <span className="kvt-achv-count">
              {t.play.achievementsProgress(achSummary.unlocked, achSummary.total)}
            </span>
          </div>
          <ul className="kvt-achv-list">
            {achievements.map((a) => (
              <li
                key={a.id}
                className={`kvt-achv-item${a.unlocked ? " kvt-achv-unlocked" : ""}`}
                title={t.play.achievementDescs[a.id]}
              >
                <span className="kvt-achv-mark" aria-hidden="true">
                  {a.unlocked ? "★" : "☆"}
                </span>
                <span className="kvt-achv-name">{t.play.achievementNames[a.id]}</span>
                <span className="kvt-achv-desc">{t.play.achievementDescs[a.id]}</span>
                {!a.unlocked && (
                  <span className="kvt-achv-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(a.ratio * 100)}%` }} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "durum" && (
        (() => {
          const goal = nextGoal({
            play,
            untreatedInjuries: play.health.injuries.filter((i) => !i.treated).length,
            activeQuests: state.quests.filter((q) => q.status === "active").length,
            claimableQuests: state.quests.filter(
              (q) => q.status === "active" && q.objectives.every((o) => o.progress >= o.required),
            ).length,
            foodCount: play.inventory.filter(
              (e) => e.quantity > 0 && state.items.find((i) => i.id === e.itemId)?.category === "food",
            ).length,
          });
          return (
            <section className={`kvt-goal kvt-goal-${goal.tone}`} aria-label={t.play.goalTitle}>
              <span className="kvt-goal-label">{t.play.goalTitle}</span>
              <p>{t.play.goals[goal.key as keyof typeof t.play.goals]}</p>
              {goal.tab !== "durum" && (
                <button type="button" className="kvt-goal-go" onClick={() => setTab(goal.tab)}>
                  {t.play.goalGo}
                </button>
              )}
            </section>
          );
        })()
      )}

      {tab === "durum" && absence && (
        <section className="kvt-absence" aria-label={t.play.absence.title}>
          <header>
            <h3>{t.play.absence.title}</h3>
            <button type="button" className="kvt-absence-close" onClick={() => setAbsence(null)}>
              ×
            </button>
          </header>
          <ul>
            {describeAbsence(t, absence).map((line, i) => (
              <li key={`${line.label}-${i}`} className={`kvt-outcome-${line.tone}`}>
                <span>{line.label}</span>
                {line.value && <strong>{line.value}</strong>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "durum" && lastOutcome && lastOutcome.lines.length > 0 && (
        <section key={lastOutcome.at} className="kvt-outcome kvt-outcome-pop" aria-label={t.play.outcome.title}>
          <h3>{t.play.outcome.title}</h3>
          <ul>
            {lastOutcome.lines.map((line, i) => (
              <li key={`${line.label}-${i}`} className={`kvt-outcome-${line.tone}`}>
                <span>{line.label}</span>
                {line.value && <strong>{line.value}</strong>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "durum" && (
        <>
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
        {state.storage && (
          <div>
            <strong>
              {state.storage.used}/{state.storage.capacity}
            </strong>
            <span>{t.play.storage}</span>
          </div>
        )}
      </div>

      <div className="kvt-progression" aria-label={t.play.progression}>
        <h3>{t.play.progression}</h3>
        <ul>
          {bars.map((bar) => (
            <li key={bar.key}>
              <span className="kvt-progression-label">
                {bar.key === "mastery"
                  ? t.play.progressionMastery
                  : bar.key === "reputation"
                    ? t.play.progressionReputation
                    : t.play.progressionUnderworld}
              </span>
              <span className="kvt-progression-level">
                {t.play.progressionLevel} {bar.level}
              </span>
              <progress max={bar.next} value={bar.current} />
              <strong>
                {bar.current}/{bar.next}
              </strong>
            </li>
          ))}
        </ul>
      </div>

      {state.storage && state.storage.overflow > 0 && (
        <p className="kvt-error" role="alert">
          {t.play.storageFull}
        </p>
      )}

      {!play.health.alive && (
        <p className="kvt-error" role="alert">
          {t.play.deadBanner}
        </p>
      )}

      {state.heir && (
        <p className="kvt-heir">
          {t.play.heir}: <strong>{state.heir}</strong>
        </p>
      )}

      <div className="kvt-personality" aria-label={t.play.personality}>
        <h3>{t.play.personality}</h3>
        <ul>
          {PERSONALITY_KEYS.map((key) => (
            <li key={key}>
              <span>{key}</span>
              <progress max={100} value={state.personality[key]} />
              <strong>{state.personality[key]}</strong>
            </li>
          ))}
        </ul>
      </div>

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

      {play.health.diseases.length > 0 && (
        <ul className="kvt-diseases">
          {play.health.diseases.map((d) => (
            <li key={d.id}>
              <span>
                {t.play.treatDisease}: {d.name} ({d.severity})
              </span>
              <button
                type="button"
                onClick={() => act({ action: "treatDisease", diseaseId: d.id, quality: 60 }, t.play.committed)}
                disabled={!play.health.alive}
              >
                {t.play.treatDisease}
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.error && (
        <p className="kvt-error" role="alert">
          {state.error}
        </p>
      )}


      </>
      )}
      {tab === "hayat" && (
        <>
      <div className="kvt-playactions">
        <button type="button" onClick={() => act({ action: "eat", itemId: "bread" }, t.play.committed)} disabled={!play.health.alive}>
          {t.play.eat}
        </button>
        <button
          type="button"
          onClick={() =>
            act(
              { action: "travel", toSettlementId: character.current_settlement ?? "varkhenn-drahkmar", season: "spring", weather: "clear", roadQuality: 70 },
              t.play.committed,
            )
          }
          disabled={!play.health.alive}
        >
          {t.play.travel}
        </button>
      </div>

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
            onClick={() => act({ action: "explore", site, preparedness }, t.play.explored)}
            disabled={!play.health.alive}
          >
            {t.play.explore}: {site}
          </button>
        ))}
      </div>
      <label className="kvt-slider">
        <span>
          {t.play.preparedness}: {preparedness}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={preparedness}
          onChange={(e) => setPreparedness(Number(e.target.value))}
        />
      </label>
      <h3>{t.play.inventory}</h3>
      <ul className="kvt-inventory">
        {play.inventory.map((entry) => (
          <li key={entry.itemId}>
            <img
              className="kvt-itemicon"
              src={iconSrc(iconForCategory(itemCategory(entry.itemId)), state.dataSaver)}
              alt=""
              width={24}
              height={24}
              loading="lazy"
            />
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
        {state.items.map((item) => (
          <li key={item.id}>
            <span>
              {item.name} — {state.marketQuote?.itemId === item.id ? state.marketQuote.buy : item.baseValue} {t.play.gold}
              {state.marketQuote?.itemId === item.id && (state.marketQuote.monopoly ?? 1) > 1
                ? ` · ${t.play.monopoly} ×${state.marketQuote.monopoly}`
                : ""}
            </span>
            <button
              type="button"
              onClick={() =>
                client
                  .market(item.id, character.current_settlement ?? undefined)
                  .then((quote) => setState((prev) => ({ ...prev, marketQuote: quote })))
                  .catch(() => undefined)
              }
            >
              {t.play.marketPrice}
            </button>
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
          <label className="kvt-slider">
            <span>
              {t.play.preparedness}: {preparedness}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={preparedness}
              onChange={(e) => setPreparedness(Number(e.target.value))}
            />
          </label>
          <ul className="kvt-hunt">
            {state.catalog.animals.map((animal) => {
              const hint = tameHint(animal, play, t);
              return (
                <li key={animal.id}>
                  <span>
                    {animal.name}
                    {animal.tameable === false ? ` (${t.play.notTameable})` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => act({ action: "hunt", animal: animal.id, preparedness }, t.play.hunted)}
                    disabled={!play.health.alive}
                  >
                    {t.play.hunt}
                  </button>
                  <button
                    type="button"
                    onClick={() => act({ action: "tame", animal: animal.id }, t.play.tamed)}
                    disabled={!play.health.alive || hint.blocked}
                    title={hint.text ?? undefined}
                  >
                    {t.play.tame}
                  </button>
                  {hint.text ? <small className="kvt-hint"> {hint.text}</small> : null}
                </li>
              );
            })}
          </ul>

          <h3>{t.play.magic}</h3>
          <p className="kvt-hint">
            {t.play.magicTrainingHint.replace("{cost}", String(magicTraining?.cost ?? 15))}
          </p>
          <button
            type="button"
            onClick={() => act({ action: "trainSpell" }, t.play.trained)}
            disabled={!play.health.alive}
            title={t.play.magicTrainingHint.replace("{cost}", String(magicTraining?.cost ?? 15))}
          >
            {t.play.trainSpell}
          </button>
          <ul className="kvt-magic">
            {state.catalog.magicPaths.map((path) => {
              const hint = learnHint(path, play, state.kingdomId, t, magicTraining);
              return (
                <li key={path.id}>
                  <span>{path.name}</span>
                  <button
                    type="button"
                    onClick={() => act({ action: "learnSpell", path: path.id }, t.play.learned)}
                    disabled={hint.blocked}
                    title={hint.text ?? undefined}
                  >
                    {t.play.learnSpell}
                  </button>
                  {hint.text ? <small className="kvt-hint"> {hint.text}</small> : null}
                </li>
              );
            })}
            {state.catalog.spells.slice(0, 4).map((spell) => {
              const hint = castHint(spell, play, t);
              return (
                <li key={spell.id}>
                  <span>
                    {spell.name} (L{spell.level})
                  </span>
                  <button
                    type="button"
                    onClick={() => act({ action: "castSpell", spellId: spell.id }, t.play.cast)}
                    disabled={!play.health.alive || hint.blocked}
                    title={hint.text ?? undefined}
                  >
                    {t.play.castSpell}
                  </button>
                  {hint.text ? <small className="kvt-hint"> {hint.text}</small> : null}
                </li>
              );
            })}
          </ul>

          <h3>{t.play.temple}</h3>
          <ul className="kvt-temple">
            {state.catalog.templeServices.map((svc) => (
              <li key={svc.service}>
                <span>
                  {svc.name ?? svc.service} — {svc.cost} {t.play.gold}
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

          <h3>{t.play.playerGroups}</h3>
          {state.group ? (
            <ul className="kvt-group">
              <li>
                <span>
                  {state.group.name} — {t.play.members}: {state.group.members.length}
                  {state.group.objective ? ` — ${state.group.objective}` : ""}
                </span>
              </li>
            </ul>
          ) : (
            <p>{t.play.noGroup}</p>
          )}
          <div className="kvt-playactions">
            {!state.group && (
              <button type="button" onClick={() => act({ action: "createGroup", name: `${character.given_name} Grubu` }, t.play.committed)}>
                {t.play.createGroup}
              </button>
            )}
            <button
              type="button"
              disabled={!state.target}
              onClick={() => act({ action: "joinGroup", groupId: state.target }, t.play.committed)}
            >
              {t.play.joinGroup}
            </button>
          </div>

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
          <label className="kvt-slider">
            <span>
              {t.play.security}: {security}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={security}
              onChange={(e) => setSecurity(Number(e.target.value))}
            />
          </label>
          <ul className="kvt-underworld">
            {state.catalog.underworldActions.map((ua) => (
              <li key={ua.action}>
                <span>{ua.name}</span>
                <button
                  type="button"
                  onClick={() => act({ action: "underworld", underworldAction: ua.action, security }, t.play.committed)}
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
      <h3>
        {t.play.bank} — {t.play.deposit}:{" "}
        {state.bank.find((b) => b.kind === "current")?.balance ?? 0} {t.play.gold}
        {" / "}
        {t.play.vault}: {state.bank.find((b) => b.kind === "vault")?.balance ?? 0} {t.play.gold}
      </h3>
      <div className="kvt-playactions">
        <button type="button" onClick={() => act({ action: "deposit", amount: 50 }, t.play.committed)}>
          {t.play.deposit} 50
        </button>
        <button type="button" onClick={() => act({ action: "withdraw", amount: 50 }, t.play.committed)}>
          {t.play.withdraw} 50
        </button>
        <button type="button" onClick={() => act({ action: "deposit", amount: 50, kind: "vault" }, t.play.committed)}>
          {t.play.vault} +50
        </button>
        <button
          type="button"
          disabled={!state.target}
          onClick={() => act({ action: "openEscrow", toId: state.target, amount: 50, condition: "trade" }, t.play.committed)}
        >
          {t.play.openEscrow}
        </button>
        <button
          type="button"
          disabled={!state.target}
          onClick={() => act({ action: "peerLoan", borrowerId: state.target, principal: 100, interestRate: 5, days: 30 }, t.play.committed)}
        >
          {t.play.peerLoan}
        </button>
      </div>

      <h3>{t.play.peerLoans}</h3>
      {state.peerLoans.length === 0 ? (
        <p>{t.play.noPeerLoans}</p>
      ) : (
        <ul className="kvt-peerloans">
          {state.peerLoans.map((l) => (
            <li key={l.id}>
              <span>
                {t.play.borrower}: {l.borrowerId.slice(0, 6)} — {t.play.outstanding}: {l.outstanding} {t.play.gold}
              </span>
              <button type="button" onClick={() => act({ action: "repayPeerLoan", loanId: l.id }, t.play.committed)}>
                {t.play.repayPeerLoan}
              </button>
              <button type="button" onClick={() => act({ action: "collectDefault", loanId: l.id }, t.play.committed)}>
                {t.play.collectDefault}
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.escrows.length > 0 && (
        <ul className="kvt-escrow">
          {state.escrows.map((e) => (
            <li key={e.id}>
              <span>
                {t.play.escrow}: {e.amount} {t.play.gold} — {e.condition}
              </span>
              <button type="button" onClick={() => act({ action: "releaseEscrow", escrowId: e.id }, t.play.committed)}>
                {t.play.release}
              </button>
              <button type="button" onClick={() => act({ action: "refundEscrow", escrowId: e.id }, t.play.committed)}>
                {t.play.refund}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>{t.play.companies}</h3>
      {state.companies.length === 0 ? (
        <div className="kvt-playactions">
          <button type="button" onClick={() => act({ action: "foundCompany", name: "Ticaret Evi", capital: 100 }, t.play.committed)}>
            {t.play.foundCompany} (100)
          </button>
        </div>
      ) : (
        <ul className="kvt-companies">
          {state.companies.map((c) => (
            <li key={c.id}>
              <span>
                {c.name} — {t.play.capital}: {c.capital} {t.play.gold} / {t.play.employees}: {c.employees} / {t.play.branches}: {c.branches}
              </span>
              <button type="button" onClick={() => act({ action: "distributeProfit", companyId: c.id }, t.play.committed)}>
                {t.play.distribute}
              </button>
              <button type="button" onClick={() => act({ action: "hireEmployee", companyId: c.id, name: "Kalfa", wage: 5 }, t.play.committed)}>
                {t.play.hire}
              </button>
              <button type="button" onClick={() => act({ action: "openBranch", companyId: c.id, settlementId: character.current_settlement ?? "varkhenn-drahkmar" }, t.play.committed)}>
                {t.play.openBranch}
              </button>
              <button
                type="button"
                disabled={!state.target}
                onClick={() => act({ action: "addPartner", companyId: c.id, partnerId: state.target, share: 10 }, t.play.committed)}
              >
                {t.play.addPartner}
              </button>
              <button type="button" onClick={() => act({ action: "acquireCompany", companyId: c.id, allPartnersAgree: true }, t.play.committed)}>
                {t.play.acquireCompany}
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.rentals.length > 0 && (
        <>
          <h3>{t.play.rentals}</h3>
          <ul className="kvt-rentals">
            {state.rentals.map((r) => (
              <li key={r.id}>
                <span>
                  {r.status} — {t.play.monthlyRent}: {r.netIncome} {t.play.gold}
                </span>
              </li>
            ))}
          </ul>
          <div className="kvt-playactions">
            <button type="button" onClick={() => act({ action: "collectRent" }, t.play.committed)}>
              {t.play.collectRent}
            </button>
            <button type="button" onClick={() => act({ action: "autoForecloseTaxes" }, t.play.committed)}>
              {t.play.autoForecloseTaxes}
            </button>
          </div>
        </>
      )}

      {state.notifications && (notifVisible.length > 0 || state.notifications.backgroundSummary) && (
        <section className="kvt-notifications" aria-label={t.play.notifications}>
          <h3>
            {t.play.notifications}
            {(state.notifications.unreadCount ?? notifUnread) > 0 && (
              <span className="kvt-badge"> ({state.notifications.unreadCount ?? notifUnread})</span>
            )}
          </h3>
          {notifVisible.length > 0 && (
            <div className="kvt-notif-groups">
              {notifGroups.map((group) => {
                const expanded = expandedGroups.includes(group.id);
                const shown = expanded ? group.items : group.items.slice(0, 3);
                return (
                  <section key={group.id} className="kvt-notif-group">
                    <h4 className="kvt-notif-group-head">
                      {t.play.notificationGroups[group.id]}
                      {group.unread > 0 && <span className="kvt-badge"> ({group.unread})</span>}
                    </h4>
                    <ul>
                      {shown.map((n) => (
                        <li key={n.id} className={n.read ? "kvt-notif-read" : "kvt-notif-unread"}>
                          <span>{n.summary}</span>
                          {!n.read && (
                            <button
                              type="button"
                              aria-label={`${t.play.markRead}: ${n.summary}`}
                              onClick={() => {
                                void client.markNotificationsRead(token, [n.id]).then(() => load());
                              }}
                            >
                              {t.play.markRead}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {group.items.length > 3 && (
                      <button
                        type="button"
                        className="kvt-notif-more"
                        onClick={() =>
                          setExpandedGroups((prev) =>
                            expanded ? prev.filter((x) => x !== group.id) : [...prev, group.id],
                          )
                        }
                      >
                        {expanded
                          ? t.play.showLessNotifications
                          : `${t.play.showAllNotifications} (${group.items.length})`}
                      </button>
                    )}
                  </section>
                );
              })}
            </div>
          )}
          {state.notifications.backgroundSummary && (
            <p className="kvt-notif-bg">
              <strong>{t.play.backgroundEvents}:</strong> {state.notifications.backgroundSummary}
            </p>
          )}
          {notifVisible.some((n) => !n.read) && (
            <button
              type="button"
              onClick={() => {
                void client
                  .markNotificationsRead(token, notifVisible.filter((n) => !n.read).map((n) => n.id))
                  .then(() => load());
              }}
            >
              {t.play.markAllRead}
            </button>
          )}
        </section>
      )}

      </>
      )}
      {tab === "siyaset" && (
        <>
      <h3>{t.play.chooseTarget}</h3>
      {state.directory.length === 0 ? (
        <p>{t.play.noTargets}</p>
      ) : (
        <label className="kvt-target">
          {t.play.target}
          <select value={state.target} onChange={(e) => setState((prev) => ({ ...prev, target: e.target.value }))}>
            <option value="">—</option>
            {state.directory.map((p2) => (
              <option key={p2.characterId} value={p2.characterId}>
                {p2.givenName} {p2.surname} ({p2.currentSettlement ?? "?"}, {p2.ageYears})
              </option>
            ))}
          </select>
        </label>
      )}

      <h3>{t.play.multiplayer}</h3>
      <div className="kvt-playactions">
        <button
          type="button"
          disabled={!state.target}
          onClick={() => act({ action: "offerTrade", toId: state.target, offerGold: 20, offerItems: [], requestGold: 0, requestItems: [] }, t.play.committed)}
        >
          {t.play.offerTrade}
        </button>
        <button type="button" onClick={() => act({ action: "createAlliance", name: "Kül Paktı" }, t.play.committed)}>
          {t.play.createAlliance}
        </button>
        <button
          type="button"
          disabled={!state.target}
          onClick={() => act({ action: "joinAlliance", allianceId: state.target }, t.play.committed)}
        >
          {t.play.joinAlliance}
        </button>
      </div>

      <h3>{t.play.kingdoms}</h3>
      <ul className="kvt-relations-list">
        {state.relations.map((r) => (
          <li key={`${r.fromKingdomId}-${r.toKingdomId}`}>
            <span>
              {r.fromKingdomId} → {r.toKingdomId}: {r.stance} ({r.affinity})
            </span>
            <button type="button" onClick={() => act({ action: "formAlliance", fromKingdomId: r.fromKingdomId, toKingdomId: r.toKingdomId }, t.play.committed)}>
              {t.play.formAlliance}
            </button>
            <button type="button" onClick={() => act({ action: "declareWar", fromKingdomId: r.fromKingdomId, toKingdomId: r.toKingdomId }, t.play.committed)}>
              {t.play.declareWar}
            </button>
            <button type="button" onClick={() => act({ action: "makePeace", fromKingdomId: r.fromKingdomId, toKingdomId: r.toKingdomId }, t.play.committed)}>
              {t.play.makePeace}
            </button>
          </li>
        ))}
      </ul>

      <h3>{t.play.motions}</h3>
      {state.motions.length === 0 ? (
        <p>{t.play.noMotions}</p>
      ) : (
        <ul className="kvt-motions">
          {state.motions.map((m) => (
            <li key={m.id}>
              <span>
                {m.title} — {m.status} ({m.yesWeight}/{m.noWeight})
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="kvt-playactions">
        <button type="button" onClick={() => act({ action: "councilMotion", title: "Vergi Artışı", quorum: 3 }, t.play.committed)}>
          {t.play.councilMotion}
        </button>
        <button type="button" onClick={() => act({ action: "resignOffice" }, t.play.committed)} disabled={!state.office}>
          {t.play.resignOffice}
        </button>
      </div>

      {state.alliance && (
        <p className="kvt-alliance">
          {t.play.alliance}: {state.alliance.name} ({state.alliance.members.length})
        </p>
      )}
      <h3>{t.play.pendingOffers}</h3>
      {state.trades.length === 0 && <p>{t.play.noTrades}</p>}
      {state.trades.length > 0 && (
        <ul className="kvt-trades">
          {state.trades.map((tr) => (
            <li key={tr.id}>
              <span>
                {t.play.barter}: {tr.offerGold} {t.play.gold} → {tr.toId.slice(0, 6)}
              </span>
              <button type="button" onClick={() => act({ action: "acceptTrade", offerId: tr.id }, t.play.committed)}>
                {t.play.accept}
              </button>
              <button type="button" onClick={() => act({ action: "rejectTrade", offerId: tr.id }, t.play.committed)}>
                {t.play.reject}
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.relations.length > 0 && (
        <p className="kvt-relations">
          {t.play.diplomacy}: {state.relations.filter((r) => r.stance === "war").length} {t.play.wars},{" "}
          {state.relations.filter((r) => r.stance === "allied").length} {t.play.alliances}
        </p>
      )}
      {state.children.length > 0 && (
        <ul className="kvt-children">
          {state.children.map((c) => (
            <li key={c.id}>
              {c.name} — {c.stageLabel} ({t.play.development}: {c.developmentBonus})
            </li>
          ))}
        </ul>
      )}

      </>
      )}
      {tab === "dunya" && (
        <>
      <h3>{t.play.appearance}</h3>
      <div className="kvt-apperance-editor">
        <CharacterAvatar appearance={appearance} seed={character.id} size={120} className="kvt-avatar-lg" title={t.play.appearance} />
        <div className="kvt-apperance-fields">
          <label>
            {t.play.face}
            <select
              value={appearance?.faceShape ?? ""}
              onChange={(e) => act({ action: "setAppearance", appearance: { faceShape: e.target.value || null } }, t.play.appearanceSaved)}
            >
              <option value="">{t.play.none}</option>
              {(state.catalog?.appearance?.faceShapes ?? []).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            {t.play.hair}
            <select
              value={appearance?.hairStyle ?? ""}
              onChange={(e) => act({ action: "setAppearance", appearance: { hairStyle: e.target.value || null } }, t.play.appearanceSaved)}
            >
              <option value="">{t.play.none}</option>
              {(state.catalog?.appearance?.hairStyles ?? []).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            {t.play.hairColor}
            <select
              value={appearance?.hairColor ?? ""}
              onChange={(e) => act({ action: "setAppearance", appearance: { hairColor: e.target.value || null } }, t.play.appearanceSaved)}
            >
              <option value="">{t.play.none}</option>
              {(state.catalog?.appearance?.hairColors ?? []).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            {t.play.build}
            <select
              value={appearance?.build ?? ""}
              onChange={(e) => act({ action: "setAppearance", appearance: { build: e.target.value || null } }, t.play.appearanceSaved)}
            >
              <option value="">{t.play.none}</option>
              {(state.catalog?.appearance?.builds ?? []).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            {t.play.skinTone}
            <select
              value={appearance?.skinTone ?? ""}
              onChange={(e) => act({ action: "setAppearance", appearance: { skinTone: e.target.value || null } }, t.play.appearanceSaved)}
            >
              <option value="">{t.play.none}</option>
              {(state.catalog?.appearance?.skinTones ?? []).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            {t.play.eyeColor}
            <select
              value={appearance?.eyeColor ?? ""}
              onChange={(e) => act({ action: "setAppearance", appearance: { eyeColor: e.target.value || null } }, t.play.appearanceSaved)}
            >
              <option value="">{t.play.none}</option>
              {(state.catalog?.appearance?.eyeColors ?? []).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <p className="kvt-outfit-note">
            {t.play.outfit}: <strong>{t.play.outfitRags}</strong> — {t.play.outfitRagsNote}
          </p>
        </div>
      </div>

      <h3>
        {t.play.family} — {t.play.spouse}: {state.family?.spouseName ?? t.play.noSpouse}, {t.play.children}: {state.family?.children ?? 0}
      </h3>
      <div className="kvt-playactions">
        <button
          type="button"
          onClick={() => act({ action: "marry", spouseName: "Elara Veyr", consented: true }, t.play.committed)}
          disabled={!play.health.alive || Boolean(state.family?.spouseId || state.family?.spouseName)}
        >
          {t.play.marry}
        </button>
        <button
          type="button"
          onClick={() => act({ action: "haveChild" }, t.play.committed)}
          disabled={!play.health.alive || !state.family?.spouseName}
        >
          {t.play.haveChild}
        </button>
        <button
          type="button"
          onClick={() => act({ action: "recordChild", name: "Çocuk", parentAttention: 60, wetNurseQuality: 60 }, t.play.committed)}
          disabled={!play.health.alive}
        >
          {t.play.recordChild}
        </button>
        <button type="button" onClick={() => act({ action: "recordDeath", note: "yaşlılık" }, t.play.committed)}>
          {t.play.recordDeath}
        </button>
      </div>


      <h3>{t.play.chat} — {t.play.globalChannel}</h3>
      {state.chat.length === 0 && <p>{t.play.chatEmpty}</p>}
      <ul className="kvt-chat">
        {state.chat.map((m) => (
          <li key={m.id}>
            <span>
              {m.senderId}: {m.body}
            </span>
          </li>
        ))}
      </ul>
      <div className="kvt-playactions">
        <input
          aria-label={t.play.chat}
          value={state.chatDraft}
          onChange={(e) => setState((prev) => ({ ...prev, chatDraft: e.target.value }))}
        />
        <button
          type="button"
          onClick={() => {
            act({ action: "sendMessage", channel: "global", body: state.chatDraft }, t.play.committed);
            setState((prev) => ({ ...prev, chatDraft: "" }));
          }}
          disabled={state.chatDraft.trim().length === 0}
        >
          {t.play.sendMessage}
        </button>
      </div>

      <h3>{t.play.quests} — {t.play.questLog}</h3>
      {state.quests.length === 0 && <p>{t.play.noQuests}</p>}
      <ul className="kvt-quests">
        {state.quests.map((q) => (
          <li key={q.questId}>
            <strong>{q.title}</strong>{" "}
            <span>{q.status === "completed" ? t.play.questCompleted : t.play.questActive}</span>
            <ul>
              {q.objectives.map((o) => (
                <li key={o.id}>
                  {o.description}: {o.progress}/{o.required}
                </li>
              ))}
            </ul>
            {q.status !== "completed" && (
              <button type="button" onClick={() => act({ action: "claimQuest", questId: q.questId }, t.play.committed)}>
                {t.play.claimQuest}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="kvt-playactions">
        {state.questCatalog
          .filter((c) => !state.quests.some((q) => q.questId === c.id))
          .map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => act({ action: "startQuest", questId: c.id }, t.play.committed)}
              disabled={!play.health.alive}
            >
              {t.play.startQuest}: {c.title}
            </button>
          ))}
      </div>

      <h3>{t.play.auctions}</h3>
      {state.auctions.length === 0 && <p>{t.play.noAuctions}</p>}
      <ul className="kvt-auctions">
        {state.auctions.map((a) => (
          <li key={a.id}>
            <span>
              {a.itemId} x{a.quantity} — {t.play.currentBid}: {a.currentBid} ({t.play.reservePrice}: {a.reservePrice})
            </span>
            <button
              type="button"
              onClick={() => act({ action: "bidAuction", auctionId: a.id, amount: a.currentBid + 5 }, t.play.committed)}
              disabled={!play.health.alive}
            >
              {t.play.bid}
            </button>
          </li>
        ))}
      </ul>
      <div className="kvt-playactions">
        <button
          type="button"
          onClick={() =>
            act({ action: "createAuction", itemId: "iron-ore", quantity: 1, reservePrice: 10 }, t.play.committed)
          }
          disabled={!play.health.alive}
        >
          {t.play.createAuction}
        </button>
      </div>
      </>
      )}
      {tab === "guc" && (
        <>
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

      </>
      )}
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
      {tab === "ekonomi" && (
        <>
      <h3>
        {t.play.economy} — {t.play.debts}: {play.debts}
      </h3>
      {state.properties.length === 0 ? (
        <p>{t.play.noProperties}</p>
      ) : (
        <ul className="kvt-properties">
          {state.properties.map((prop) => (
            <li key={prop.id}>
              <span>
                {prop.propertyType} — {prop.value} {t.play.gold}
              </span>
              <button type="button" onClick={() => act({ action: "listForRent", propertyId: prop.id, monthlyRate: 10 }, t.play.committed)}>
                {t.play.listForRent}
              </button>
              <button type="button" onClick={() => act({ action: "foreclose", propertyId: prop.id, debt: 50 }, t.play.committed)}>
                {t.play.foreclose}
              </button>
              <button
                type="button"
                disabled={!state.target}
                onClick={() => act({ action: "openTitleDispute", propertyId: prop.id, claimantB: state.target }, t.play.committed)}
              >
                {t.play.openTitleDispute}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>{t.play.titleDisputes}</h3>
      {state.titleDisputes.length === 0 ? (
        <p>{t.play.noDisputes}</p>
      ) : (
        <ul className="kvt-disputes">
          {state.titleDisputes.map((d) => (
            <li key={d.id}>
              <span>
                {t.play.property}: {d.propertyId.slice(0, 6)} — {d.status}
              </span>
              <button type="button" onClick={() => act({ action: "resolveTitleDispute", disputeId: d.id }, t.play.committed)}>
                {t.play.resolveTitleDispute}
              </button>
            </li>
          ))}
        </ul>
      )}
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


      </>
      )}
    </section>
  );
}
