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
}
