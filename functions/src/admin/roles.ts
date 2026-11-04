/**
 * Rol yonetimi (belge 20).
 *
 * Oyuncu/moderator/admin rol dagilimi yalnizca YONETIM panelinden yapilir ve
 * SUNUCU tarafinda uygulanir; istemci rol otoritesi degildir (belge 21.1).
 * Her rol degisikligi `audit_log`'a yazilir.
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";

export type AccountRole = "player" | "moderator" | "admin";

export const ACCOUNT_ROLES: readonly AccountRole[] = ["player", "moderator", "admin"];

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === "string" && (ACCOUNT_ROLES as readonly string[]).includes(value);
}

export interface AdminAccountRow {
  id: string;
  email: string;
  role: AccountRole;
  status: string;
  createdAt: number;
  characterCount: number;
}

/** Hesap listesi: rol dagilimini yonetmek icin (belge 20). Yalnizca yonetici. */
export async function adminAccounts(db: SqlDatabase, limit = 100): Promise<AdminAccountRow[]> {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = await queryAll<{
    id: string;
    email: string;
    role: AccountRole;
    status: string;
    created_at: number;
    character_count: number;
  }>(
    db,
    `SELECT a.id, a.email, a.role, a.status, a.created_at,
            (SELECT COUNT(*) FROM characters c WHERE c.account_id = a.id) AS character_count
     FROM accounts a ORDER BY a.created_at DESC LIMIT ?`,
    safeLimit,
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
    characterCount: r.character_count,
  }));
}

export interface SetRoleResult {
  ok: boolean;
  reason?: "not_found" | "invalid_role" | "last_admin";
  role?: AccountRole;
}

/**
 * Hesap rolunu degistirir. Son adminin dusurulmesi ENGELLENIR: aksi halde
 * yonetim paneli kilitli kalir ve kimse rol dagitamaz.
 */
export async function adminSetAccountRole(
  db: SqlDatabase,
  accountId: string,
  role: AccountRole,
  actorAccountId: string | null = null,
  nowMs = Date.now(),
): Promise<SetRoleResult> {
  if (!isAccountRole(role)) return { ok: false, reason: "invalid_role" };
  const account = await queryOne<{ id: string; role: AccountRole }>(
    db,
    "SELECT id, role FROM accounts WHERE id = ?",
    accountId,
  );
  if (!account) return { ok: false, reason: "not_found" };

  if (account.role === "admin" && role !== "admin") {
    const admins = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM accounts WHERE role = 'admin'");
    if ((admins?.n ?? 0) <= 1) return { ok: false, reason: "last_admin" };
  }

  await execute(db, "UPDATE accounts SET role = ?, updated_at = ? WHERE id = ?", role, nowMs, accountId);
  await execute(
    db,
    "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, detail, created_at) VALUES (?,?,?,?,?,?,?)",
    crypto.randomUUID(),
    actorAccountId,
    "account_role_change",
    "account",
    accountId,
    JSON.stringify({ from: account.role, to: role }),
    nowMs,
  );
  return { ok: true, role };
}
