/**
 * Arka uc API istemcisi.
 *
 * Kritik islemler (para, esya, ticaret, savas) SUNUCUDA dogrulanir; bu
 * istemci yalnizca istek gonderir ve sonucu gosterir. Istemci hicbir zaman
 * miktar/para otoritesi degildir (tasarim belgesi 21.1).
 */

export interface ApiError {
  code: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface SettlementDto {
  id: string;
  name: string;
  kind: "capital" | "city" | "town" | "village" | "castle";
  kingdomId: string;
  x: number;
  y: number;
  primaryOutput: string;
}

export interface WorldSummaryDto {
  kingdoms: number;
  freeCities: number;
  neutralZones: number;
  settlements: number;
  settlementsTarget: number;
}

export interface WorldTimeDto {
  gameDay: number;
  gameYear: number;
  season: "spring" | "summer" | "autumn" | "winter";
  advancedDays: number;
}

export interface SessionDto {
  token: string;
  expiresAt: number;
}
export interface MeDto {
  accountId: string;
  role: "player" | "moderator" | "admin";
}

export interface CharacterDto {
  id: string;
  given_name: string;
  surname: string;
  birth_settlement: string | null;
  current_settlement: string | null;
  age_years: number;
  generation: number;
}

export interface ItemDefDto {
  id: string;
  name: string;
  category: string;
  baseValue: number;
  nutrition?: number;
  healing?: number;
}

export interface RecipeDto {
  id: string;
  output: string;
  outputQuantity: number;
  baseChance: number;
}

export interface InjuryDto {
  id: string;
  kind: string;
  severity: number;
  bleeding: number;
  infection: number;
  treated: boolean;
}

export interface HealthDto {
  health: number;
  hunger: number;
  fatigue: number;
  alive: boolean;
  injuries: InjuryDto[];
  diseases: { id: string; name: string; severity: number }[];
}

export interface InventoryEntryDto {
  itemId: string;
  quantity: number;
  condition: number;
}

export interface PlayStateDto {
  characterId: string;
  health: HealthDto;
  inventory: InventoryEntryDto[];
  gold: number;
  debts: number;
  reputation: number;
  weapon: string;
  weaponMastery: number;
  strength: number;
  magicLevel: number;
  energy: number;
  magicPaths: string[];
  underworldRep: number;
}

export interface UnitDto {
  id: string;
  unitType: string;
  strength: number;
  morale: number;
  supply: number;
  experience: number;
}

export interface ShipDto {
  id: string;
  shipClass: string;
  condition: number;
}

export interface PropertyDto {
  id: string;
  propertyType: string;
  settlementId: string | null;
  value: number;
  taxRate: number;
}

export interface LoanDto {
  principal: number;
  outstanding: number;
  active: boolean;
}

export interface PrisonDto {
  settlementId: string | null;
  daysRemaining: number;
  escapeAttempts: number;
}

export interface SocialDto {
  targetId: string;
  kind: string;
}

export interface OfficeDto {
  kingdomId: string | null;
  title: string;
  rank: string;
  servicePoints: number;
}

export interface DiplomacyDto {
  from: string;
  to: string;
  stance: string;
}

export interface FamilyDto {
  spouseId: string | null;
  spouseName: string | null;
  marriedDay: number | null;
  children: number;
}

export interface AppearanceDto {
  faceShape: string | null;
  skinTone: string | null;
  eyeColor: string | null;
  hairColor: string | null;
  hairStyle: string | null;
  beardStyle: string | null;
  heightCm: number | null;
  build: string | null;
  scars: string | null;
  tattoos: string | null;
  outfit: string | null;
}

export interface AppearanceOptionsDto {
  faceShapes: string[];
  skinTones: string[];
  eyeColors: string[];
  hairColors: string[];
  hairStyles: string[];
  beardStyles: string[];
  builds: string[];
  outfits: string[];
  heightMinCm: number;
  heightMaxCm: number;
}

export interface BankAccountDto {
  id: string;
  kind: "current" | "vault";
  balance: number;
  interestRate: number;
}

export interface EscrowDto {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  condition: string;
  status: "held" | "released" | "refunded" | "disputed";
  createdGameDay: number;
}

export interface PeerLoanDto {
  id: string;
  borrowerId: string;
  lenderId: string;
  principal: number;
  outstanding: number;
  interestRate: number;
  issuedGameDay: number;
  dueGameDay: number;
}

export interface CompanyPartnerDto {
  ownerId: string;
  ownerType: string;
  share: number;
}

export interface CompanyDto {
  id: string;
  name: string;
  capital: number;
  partners: CompanyPartnerDto[];
  controllingPartnerId: string | null;
  valuation: number;
  employees: number;
  branches: number;
  dailyPayroll: number;
}

export interface RentalDto {
  id: string;
  propertyId: string;
  monthlyRate: number;
  occupancy: number;
  status: "active" | "vacant" | "ended";
  monthlyIncome: number;
  netIncome: number;
}

export interface TitleDisputeDto {
  id: string;
  propertyId: string;
  claimantA: string;
  claimantB: string;
  status: "open" | "resolved_a" | "resolved_b" | "dismissed";
}

export interface TradeItemDto {
  itemId: string;
  quantity: number;
}

export interface TradeOfferDto {
  id: string;
  fromId: string;
  toId: string;
  offerGold: number;
  offerItems: TradeItemDto[];
  requestGold: number;
  requestItems: TradeItemDto[];
  status: "pending" | "accepted" | "rejected" | "cancelled";
}

export interface AllianceDto {
  id: string;
  name: string;
  leaderId: string;
  members: string[];
}

export interface ChildDto {
  id: string;
  name: string;
  stage: string;
  stageLabel: string;
  developmentBonus: number;
  daysToAdulthood: number;
}

export interface KingdomRelationDto {
  fromKingdomId: string;
  toKingdomId: string;
  stance: "neutral" | "allied" | "war" | "truce";
  affinity: number;
  allianceUntil: number | null;
}

export interface MotionDto {
  id: string;
  kingdomId: string;
  title: string;
  status: "open" | "passed" | "rejected";
  yesWeight: number;
  noWeight: number;
}

export interface AdminOverviewDto {
  accounts: number;
  characters: number;
  aliveCharacters: number;
  settlements: number;
  kingdoms: number;
  totalGold: number;
  properties: number;
  companies: number;
  auctionsOpen: number;
  gameDay: number;
  gameYear: number;
}

export interface AdminCharacterDto {
  id: string;
  givenName: string;
  surname: string;
  accountId: string;
  alive: boolean;
  gold: number;
  reputation: number;
  currentSettlement: string | null;
}

export interface AdminEconomyDto {
  settlementId: string;
  itemId: string;
  supply: number;
  demand: number;
  price: number;
}

export interface NotificationDto {
  id: string;
  kind: string;
  priority: number;
  summary: string;
  createdAtMs: number;
  read: boolean;
}

export interface NotificationDigestDto {
  visible: NotificationDto[];
  backgroundSummary: string | null;
  unreadCount: number;
}

export interface AssetDto {
  assetKey: string;
  category: "portrait" | "icon" | "map" | "crest" | "environment";
  license: string;
  source: string;
  r2Key: string;
  thumbnailKey?: string;
  tags: string[];
}

export interface AssetCatalogDto {
  count: number;
  assets: AssetDto[];
  attributions: string[];
}

export interface GroupDto {
  id: string;
  name: string;
  leaderCharacterId: string;
  objective: string | null;
  members: string[];
}

export interface ChatMessageDto {
  id: string;
  channelKind: string;
  channelScope: string | null;
  senderId: string;
  recipientId: string | null;
  body: string;
  sentAt: number;
}

export interface ChatResponse {
  channel: string;
  scopeId: string | null;
  count: number;
  messages: ChatMessageDto[];
}

export interface PlayerSummaryDto {
  characterId: string;
  givenName: string;
  surname: string;
  currentSettlement: string | null;
  ageYears: number;
  generation: number;
}

export interface PlayStateResponse {
  state: PlayStateDto;
  items: ItemDefDto[];
  recipes: RecipeDto[];
  explorationSites: string[];
  units: UnitDto[];
  ships: ShipDto[];
  properties: PropertyDto[];
  loan: LoanDto | null;
  prison: PrisonDto | null;
  social: SocialDto[];
  office: OfficeDto | null;
  family: FamilyDto | null;
  group: GroupDto | null;
  appearance: AppearanceDto;
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
  storage: StorageDto;
  diplomacy: DiplomacyDto[];
  directory: PlayerSummaryDto[];
}

export interface StorageDto {
  used: number;
  capacity: number;
  overflow: number;
  preservationFactor: number;
}

export interface QuestObjectiveDto {
  id: string;
  description: string;
  progress: number;
  required: number;
}

export interface QuestLogEntryDto {
  questId: string;
  title: string;
  status: string;
  stage: number;
  objectives: QuestObjectiveDto[];
}

export interface QuestCatalogEntryDto {
  id: string;
  title: string;
  description: string;
  type: string;
  rewardGold: number;
  solutions: string[];
  objectives: { id: string; description: string; required: number }[];
}

export interface QuestsResponse {
  catalog: QuestCatalogEntryDto[];
  log: QuestLogEntryDto[];
}

export interface AuctionDto {
  id: string;
  itemId: string;
  quantity: number;
  reservePrice: number;
  currentBid: number;
  currentBidderId: string | null;
  /** Artirmanin kapandigi dunya gunu. */
  closesDay: number;
}

export interface MarketQuoteDto {
  itemId: string;
  settlementId?: string;
  buy: number;
  sell: number;
  base: number;
  supply?: number;
  demand?: number;
  disruption?: number;
  /** Bolgesel tekel carpani (belge 9.4); 1 ise tekel yok. */
  monopoly?: number;
}

export type PlayAction =
  | { action: "eat"; itemId: string }
  | { action: "rest"; hours: number }
  | { action: "craft"; recipeId: string }
  | { action: "work"; profession: string; hours: number }
  | { action: "travel"; toSettlementId: string; season: string; weather: string; roadQuality: number; isCaravan?: boolean }
  | { action: "explore"; site: string; preparedness: number }
  | { action: "trade"; itemId: string; quantity: number; side: "buy" | "sell" }
  | { action: "treat"; injuryId: string; method: "bandage" | "herb" | "surgery" | "rest"; quality: number }
  | { action: "treatDisease"; diseaseId: string; quality: number }
  | { action: "plant"; crop: string; season: string; weather: string; soilQuality?: number }
  | { action: "harvest" }
  | { action: "hunt"; animal: string; preparedness: number }
  | { action: "tame"; animal: string }
  | { action: "learnSpell"; path: string }
  | { action: "castSpell"; spellId: string }
  | { action: "temple"; service: "healing" | "knowledge" | "shelter" | "protection" }
  | { action: "joinGuild"; guildId: string }
  | { action: "createGroup"; name: string; objective?: string | null }
  | { action: "joinGroup"; groupId: string }
  | { action: "activity"; kind: string }
  | { action: "underworld"; underworldAction: string; security?: number; gangAffiliation?: boolean }
  | { action: "recruit"; unitType: string; strength: number }
  | { action: "resupply" }
  | { action: "battle"; terrain?: string }
  | { action: "siege"; siegeEngines?: number }
  | { action: "buildShip"; shipClass: string }
  | { action: "navalBattle" }
  | { action: "takeLoan"; amount: number }
  | { action: "repayLoan" }
  | { action: "buyProperty"; propertyType: string }
  | { action: "runBusiness" }
  | { action: "payTaxes" }
  | { action: "crime"; crimeType: string; evidence?: number }
  | { action: "escape"; bribe?: number }
  | { action: "fight"; opponentStrength?: number }
  | { action: "duel"; consented: boolean; opponentStrength?: number }
  | { action: "setRelationship"; targetId: string; kind: string }
  | { action: "seekOffice"; title: string }
  | { action: "setAppearance"; appearance: Partial<AppearanceDto> }
  | { action: "deposit"; amount: number; kind?: "current" | "vault" }
  | { action: "withdraw"; amount: number; kind?: "current" | "vault" }
  | { action: "openEscrow"; toId: string; amount: number; condition: string }
  | { action: "releaseEscrow"; escrowId: string }
  | { action: "refundEscrow"; escrowId: string }
  | { action: "peerLoan"; borrowerId: string; principal: number; interestRate: number; days: number }
  | { action: "repayPeerLoan"; loanId: string }
  | { action: "collectDefault"; loanId: string }
  | { action: "foundCompany"; name: string; capital: number }
  | { action: "addPartner"; companyId: string; partnerId: string; share: number }
  | { action: "distributeProfit"; companyId: string }
  | { action: "acquireCompany"; companyId: string; allPartnersAgree?: boolean }
  | { action: "hireEmployee"; companyId: string; name: string; wage: number }
  | { action: "openBranch"; companyId: string; settlementId: string }
  | { action: "listForRent"; propertyId: string; monthlyRate: number }
  | { action: "collectRent" }
  | { action: "foreclose"; propertyId: string; debt: number }
  | { action: "autoForecloseTaxes" }
  | { action: "openTitleDispute"; propertyId: string; claimantB: string }
  | { action: "resolveTitleDispute"; disputeId: string }
  | { action: "offerTrade"; toId: string; offerGold: number; offerItems: TradeItemDto[]; requestGold: number; requestItems: TradeItemDto[] }
  | { action: "acceptTrade"; offerId: string }
  | { action: "rejectTrade"; offerId: string }
  | { action: "formAlliance"; fromKingdomId: string; toKingdomId: string }
  | { action: "declareWar"; fromKingdomId: string; toKingdomId: string }
  | { action: "makePeace"; fromKingdomId: string; toKingdomId: string }
  | { action: "createAlliance"; name: string }
  | { action: "joinAlliance"; allianceId: string }
  | { action: "recordChild"; name: string; parentAttention?: number; wetNurseQuality?: number }
  | { action: "councilMotion"; title: string; quorum?: number }
  | { action: "resignOffice" }
  | { action: "recordDeath"; note: string }
  | { action: "councilMotion"; title: string; quorum?: number }
  | { action: "diplomacy"; kingdomId: string; diplomacyAction: string }
  | { action: "sendMessage"; channel: string; scopeId?: string | null; body: string; recipientId?: string | null }
  | { action: "marry"; spouseName: string; spouseId?: string | null; consented?: boolean }
  | { action: "haveChild" }
  | { action: "startQuest"; questId: string }
  | { action: "claimQuest"; questId: string }
  | { action: "createAuction"; itemId: string; quantity: number; reservePrice: number }
  | { action: "bidAuction"; auctionId: string; amount: number };

/** Sistem katalogu (E8): istemci hangi mahsul, buyu, lonca ve etkinliklerin oldugunu buradan ogrenir. */
export interface CatalogDto {
  crops: { id: string; name: string; season: string }[];
  livestock: { id: string; name: string }[];
  animals: { id: string; name: string }[];
  magicPaths: { id: string; name: string; outlawedIn: string[] }[];
  spells: { id: string; name: string; path: string; level: number }[];
  guilds: { id: string; name: string; dues: number }[];
  activities: { kind: string; name: string; cost: number }[];
  templeServices: { service: string; cost: number }[];
  underworldActions: { action: string; name: string }[];
  appearance: AppearanceOptionsDto;
}

export interface PlayActionResult {
  ok: boolean;
  state: PlayStateDto;
  detail?: Record<string, unknown>;
}

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      let detail: ApiError = { code: "unknown", message: response.statusText };
      try {
        const parsed = (await response.json()) as { error?: ApiError };
        if (parsed.error) detail = parsed.error;
      } catch {
        // Govde JSON degilse varsayilan mesaj korunur.
      }
      throw new ApiRequestError(response.status, detail.code, detail.message);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  health(): Promise<{ status: string; paidFeatures: boolean }> {
    return this.request("/api/health");
  }

  worldSummary(): Promise<WorldSummaryDto> {
    return this.request("/api/world/summary");
  }

  settlements(filter: { kingdom?: string; kind?: string } = {}): Promise<{ count: number; settlements: SettlementDto[] }> {
    const params = new URLSearchParams();
    if (filter.kingdom) params.set("kingdom", filter.kingdom);
    if (filter.kind) params.set("kind", filter.kind);
    const query = params.toString();
    return this.request(`/api/world/settlements${query ? `?${query}` : ""}`);
  }

  worldTime(): Promise<WorldTimeDto> {
    return this.request("/api/world/time");
  }

  /** Dogum yeri bilgi paneli (belge 5.1): karsilastirilabilir arti/eksi. */
  birthplace(settlementId: string): Promise<import("../screens/CharacterSetup").BirthplacePanelDto> {
    return this.request(`/api/world/birthplaces?id=${encodeURIComponent(settlementId)}`);
  }

  register(email: string, password: string, locale: "tr" | "en" = "tr"): Promise<{ accountId: string }> {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, locale }),
    });
  }

  login(email: string, password: string): Promise<SessionDto> {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  me(token: string): Promise<MeDto> {
    return this.request("/api/me", { headers: { authorization: `Bearer ${token}` } });
  }

  characters(token: string): Promise<{ characters: CharacterDto[] }> {
    return this.request("/api/characters", { headers: { authorization: `Bearer ${token}` } });
  }

  createCharacter(
    token: string,
    input: { givenName: string; surname: string; birthSettlement: string; attributes: Record<string, number> },
  ): Promise<{ characterId: string }> {
    return this.request("/api/characters", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  }

  /** Karakterin oynanis durumu (saglik, envanter, altin). Sahiplik sunucuda dogrulanir. */
  playState(token: string, characterId: string): Promise<PlayStateResponse> {
    return this.request(`/api/play/${characterId}/state`, { headers: { authorization: `Bearer ${token}` } });
  }

  /** Oynanis aksiyonu: miktar/fiyat SUNUCUDA hesaplanir; istemci otorite degildir. */
  playAction(token: string, characterId: string, action: PlayAction): Promise<PlayActionResult> {
    return this.request(`/api/play/${characterId}/action`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(action),
    });
  }

  /** Sistem katalogu (E8): mahsul, buyu, lonca, etkinlik ve yeralti listeleri. */
  catalog(): Promise<CatalogDto> {
    return this.request("/api/catalog");
  }

  /** Sohbet gecmisi (belge 16.2): kanal + kapsam ile son mesajlar. */
  chat(token: string, channel: string, scopeId: string | null = null): Promise<ChatResponse> {
    const params = new URLSearchParams({ channel });
    if (scopeId) params.set("scopeId", scopeId);
    return this.request(`/api/chat?${params.toString()}`, { headers: { authorization: `Bearer ${token}` } });
  }

  /** Gorev katalogu ve karakter gunlugu (belge 12.4, 18.3). */
  quests(token: string, characterId?: string): Promise<QuestsResponse> {
    const params = new URLSearchParams();
    if (characterId) params.set("characterId", characterId);
    const suffix = params.toString();
    return this.request(`/api/quests${suffix ? `?${suffix}` : ""}`, {
      headers: { authorization: `Bearer ${token}` },
    });
  }

  /** Acik artirmalar (belge 9.3). */
  auctions(settlementId?: string): Promise<{ auctions: AuctionDto[] }> {
    const params = new URLSearchParams();
    if (settlementId) params.set("settlementId", settlementId);
    const suffix = params.toString();
    return this.request(`/api/auctions${suffix ? `?${suffix}` : ""}`);
  }

  /** Pazar fiyati; yerlesim verilirse bozulma carpani uygulanir (belge 9.2, 9.4). */
  market(itemId: string, settlementId?: string): Promise<MarketQuoteDto> {
    const params = new URLSearchParams();
    if (settlementId) params.set("settlementId", settlementId);
    const suffix = params.toString();
    return this.request(`/api/market/${encodeURIComponent(itemId)}${suffix ? `?${suffix}` : ""}`);
  }

  /** Bildirim ozeti (belge 19): esik uzeri tek tek, arka plan tek satir. */
  notifications(token: string): Promise<NotificationDigestDto> {
    return this.request("/api/notifications", { headers: { authorization: `Bearer ${token}` } });
  }

  /** Bildirimleri okundu isaretle (belge 19). */
  markNotificationsRead(token: string, ids: string[]): Promise<{ ok: boolean; marked: number }> {
    return this.request("/api/notifications/read", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids }),
    });
  }

  /** Gorsel varlik katalogu (belge 17.4): lisans uyumlu varliklar + atiflar. */
  assetCatalog(filter: { category?: string; tag?: string } = {}): Promise<AssetCatalogDto> {
    const params = new URLSearchParams();
    if (filter.category) params.set("category", filter.category);
    if (filter.tag) params.set("tag", filter.tag);
    const suffix = params.toString();
    return this.request(`/api/assets/catalog${suffix ? `?${suffix}` : ""}`);
  }

  /** Yonetim panosu ozeti (belge 20). Yalnizca yonetici oturumu. */
  adminOverview(token: string): Promise<AdminOverviewDto> {
    return this.request("/api/admin/overview", { headers: { authorization: `Bearer ${token}` } });
  }

  /** Kullanici/karakter yonetimi listesi (belge 20). */
  adminCharacters(token: string, limit = 50): Promise<{ characters: AdminCharacterDto[] }> {
    return this.request(`/api/admin/characters?limit=${limit}`, { headers: { authorization: `Bearer ${token}` } });
  }

  /** Karakter durumunu degistirir (canli/olu) (belge 20). */
  adminSetCharacterStatus(token: string, characterId: string, status: "alive" | "dead"): Promise<{ ok: boolean }> {
    return this.request(`/api/admin/characters/${encodeURIComponent(characterId)}/status`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
  }

  /** Pazar/ekonomi izleme (belge 20). */
  adminEconomy(token: string, limit = 50): Promise<{ economy: AdminEconomyDto[] }> {
    return this.request(`/api/admin/economy?limit=${limit}`, { headers: { authorization: `Bearer ${token}` } });
  }
}
