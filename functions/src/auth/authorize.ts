/**
 * Sunucu tarafli yetkilendirme.
 *
 * D1 SQLite tabanlidir ve PostgreSQL RLS (Row-Level Security) DESTEKLEMEZ.
 * Bu nedenle RLS yerine, her kritik islemde sunucu tarafinda:
 *   1. Kimlik (kim istiyor?)
 *   2. Rol (izin matrisi)
 *   3. Sahiplik (kaynak bu oyuncuya mi ait?)
 *   4. Yetki (bu makamda bu islem yapilabilir mi?)
 * kontrolleri uygulanir. Istemciden gelen para/esya/miktar ASLA dogrudan
 * kabul edilmez.
 */

import type { SessionPayload } from "./session";

export type Role = SessionPayload["role"];

export type Action =
  | "profile:read"
  | "profile:write"
  | "trade:create"
  | "combat:resolve"
  | "property:transfer"
  | "admin:any";

const ROLE_ACTIONS: Record<Role, ReadonlySet<Action>> = {
  player: new Set<Action>(["profile:read", "profile:write", "trade:create", "combat:resolve", "property:transfer"]),
  moderator: new Set<Action>([
    "profile:read",
    "profile:write",
    "trade:create",
    "combat:resolve",
    "property:transfer",
  ]),
  admin: new Set<Action>([
    "profile:read",
    "profile:write",
    "trade:create",
    "combat:resolve",
    "property:transfer",
    "admin:any",
  ]),
};

export interface AuthzRequest {
  session: SessionPayload | null;
  action: Action;
  /** Kaynagin sahibi; sahiplik kontrolu gerektiren islemlerde zorunlu. */
  ownerAccountId?: string;
  /** Oyuncunun icinde bulundugu makam/otorite (ornek: 'governor'). */
  authority?: string;
}

export type AuthzDecision =
  | { allowed: true; reason: "ok" }
  | { allowed: false; reason: "no_session" | "role_forbidden" | "not_owner" | "no_authority" };

export function authorize(req: AuthzRequest): AuthzDecision {
  const { session, action, ownerAccountId, authority } = req;

  if (!session) return { allowed: false, reason: "no_session" };

  // admin:any her seyi kapsar; aksi halde rol izin matrisi.
  if (action !== "admin:any" && !ROLE_ACTIONS[session.role].has(action)) {
    return { allowed: false, reason: "role_forbidden" };
  }
  if (action === "admin:any" && session.role !== "admin") {
    return { allowed: false, reason: "role_forbidden" };
  }

  if (ownerAccountId !== undefined && ownerAccountId !== session.accountId) {
    // admin:any sahiplik kontrolunu atlayabilir; digerleri atlayamaz.
    if (session.role !== "admin") return { allowed: false, reason: "not_owner" };
  }

  // Yetki kontrolleri ayri bir politika servisine baglanir (E1.5). Su an
  // yalnizca bos olmayan makam bilgisi dogrulanir.
  if (authority !== undefined && authority.trim() === "") {
    return { allowed: false, reason: "no_authority" };
  }

  return { allowed: true, reason: "ok" };
}
