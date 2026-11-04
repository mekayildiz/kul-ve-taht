import { describe, expect, it } from "vitest";
import { canSendToChannel, validateMessage, canJoinGuild, canJoinGroup, isMutual, isDuelRequestValid, MAX_MESSAGE_LENGTH, MAX_GUILD_MEMBERS, MAX_GROUP_MEMBERS, DUEL_REQUEST_TTL_MS, type ChatChannel, type Guild, type Group, type DuelRequest } from "./social";

const local: ChatChannel = { id: "ch1", kind: "local", scopeId: "varkhenn-drahkmar", name: "Drahkmar" };
const global: ChatChannel = { id: "ch2", kind: "global", scopeId: null, name: "Genel" };

describe("sohbet erisimi (belge 16.2)", () => {
  it("genel kanala herkes yazabilir", () => {
    expect(canSendToChannel(global, null, false, false)).toBe(true);
  });

  it("yerel kanala yalnizca o yerlesimdeki yazar", () => {
    expect(canSendToChannel(local, "varkhenn-drahkmar", false, false)).toBe(true);
    expect(canSendToChannel(local, "solmerya-amsyra", false, false)).toBe(false);
  });

  it("lonca/grup kanali uyeligi gerektirir", () => {
    const guild: ChatChannel = { id: "g", kind: "guild", scopeId: "g1", name: "Lonca" };
    expect(canSendToChannel(guild, null, true, false)).toBe(true);
    expect(canSendToChannel(guild, null, false, false)).toBe(false);
  });

  it("bos ve asiri uzun mesaji reddeder", () => {
    expect(validateMessage("   ")).toBe("empty");
    expect(validateMessage("a".repeat(MAX_MESSAGE_LENGTH + 1))).toBe("too_long");
    expect(validateMessage("merhaba")).toBeNull();
  });
});

describe("lonca ve grup (belge 16.4)", () => {
  it("lonca kapasitesi sinirlidir", () => {
    const full: Guild = { id: "g", name: "L", leaderCharacterId: "c1", members: Array(MAX_GUILD_MEMBERS).fill({ characterId: "x", rank: "üye" }), treasury: 0, reputation: 0 };
    expect(canJoinGuild(full)).toBe(false);
  });

  it("grup kapasitesi 8 kisidir", () => {
    const full: Group = { id: "gr", name: "G", leaderCharacterId: "c1", members: Array(MAX_GROUP_MEMBERS).fill("x"), objective: null };
    expect(canJoinGroup(full)).toBe(false);
  });
});

describe("oyuncu iliskileri (belge 16.3)", () => {
  it("arkadaslik karsilikli olmali", () => {
    const a = [{ fromCharacterId: "c1", toCharacterId: "c2", kind: "friend" as const, affinity: 50 }];
    const b = [{ fromCharacterId: "c2", toCharacterId: "c1", kind: "friend" as const, affinity: 50 }];
    expect(isMutual(a, b)).toBe(true);
    expect(isMutual(a, [])).toBe(false);
  });
});

describe("duello daveti (belge 16.5)", () => {
  it("kabul edilmemis ve suresi gecmemis davet gecerlidir", () => {
    const req: DuelRequest = { id: "d1", challengerId: "c1", defenderId: "c2", accepted: false, createdAtMs: 1000 };
    expect(isDuelRequestValid(req, 1000 + DUEL_REQUEST_TTL_MS - 1)).toBe(true);
    expect(isDuelRequestValid(req, 1000 + DUEL_REQUEST_TTL_MS + 1)).toBe(false);
    expect(isDuelRequestValid({ ...req, accepted: true }, 1000)).toBe(false);
  });
});
