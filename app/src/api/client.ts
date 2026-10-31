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
}

export interface PlayStateResponse {
  state: PlayStateDto;
  items: ItemDefDto[];
  recipes: RecipeDto[];
  explorationSites: string[];
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
  | { action: "treatDisease"; diseaseId: string; quality: number };

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
}
