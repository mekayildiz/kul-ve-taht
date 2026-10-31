/**
 * Gorevler (tasarim belgesi 12.4, 18.3): ana hikaye, yan gorevler ve serbest isler.
 *
 * Gorevlerin birden fazla cozumu ve uzun vadeli sonuclari vardir. Ilerleme
 * SUNUCUDA islenir ve `character_quests` tablosunda kalici tutulur. Bir hedef
 * yalnizca gorevin tanimladigi etiketle ilerletilebilir; boylece istemci
 * uydurma ilerleme gonderemez (belge 21.1).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";
import { completeQuest, type CharacterQuest, type Quest, type QuestObjective } from "../quests/system";
import { loadState, saveState, type PlayResult } from "./service";

/** Bir gorev hedefi: ilerleme etiketi (orn. 'explore:forest') ve gereken miktar. */
export interface CatalogObjective extends QuestObjective {
  tag: string;
}

export interface CatalogQuest extends Omit<Quest, "objectives"> {
  objectives: CatalogObjective[];
}

/** Gorev katalogu: ana hikaye Valedorn ve Kul Savasi'ni tanitir (belge 12.4). */
export const QUEST_CATALOG: CatalogQuest[] = [
  {
    id: "main-ashes-1",
    title: "Kulun Uzerinde",
    description:
      "Valedorn'un kulleri arasinda bir baslangic. Yerel kusu ve kayip bir kalinti izini takip et.",
    type: "main",
    giverNpcId: null,
    objectives: [
      { id: "explore", description: "Cevreyi kesfet", required: 2, tag: "explore:forest" },
      { id: "hunt", description: "Bir yaban hayvani avla", required: 1, tag: "hunt:wolf" },
    ],
    rewardGold: 60,
    solutions: ["Kesif yap", "Avlan", "Yerel halktan bilgi topla"],
    longTermEffect: "valedorn_introduced",
  },
  {
    id: "side-family-1",
    title: "Aile Meselesi",
    description: "Hanedanindan kalan bir mirasi ara ve ailenin itibarini geri kazan.",
    type: "side",
    giverNpcId: null,
    objectives: [
      { id: "craft", description: "Bir esya uret", required: 2, tag: "craft:any" },
      { id: "trade", description: "Pazarda alim satim yap", required: 3, tag: "trade:any" },
    ],
    rewardGold: 40,
    solutions: ["Zanaat ogren", "Ticaret yap", "Aile uyeleriyle konus"],
    longTermEffect: "family_reputation_up",
  },
  {
    id: "side-explore-1",
    title: "Kayip Yerler",
    description: "Harabelerde ve magaralarda kayip bir yerin izini bul.",
    type: "exploration",
    giverNpcId: null,
    objectives: [{ id: "ruins", description: "Harabeleri kesfet", required: 1, tag: "explore:ruin" }],
    rewardGold: 50,
    solutions: ["Kesif yap", "Yerel efsaneleri dinle"],
    longTermEffect: "ruins_discovered",
  },
  {
    id: "crisis-famine-1",
    title: "Kitlik Yili",
    description: "Yerel kitlikta tahil tedarik et ve halki doyur.",
    type: "crisis",
    giverNpcId: null,
    objectives: [{ id: "supply", description: "Tahil al", required: 5, tag: "trade:any" }],
    rewardGold: 35,
    solutions: ["Pazardan al", "Tarladan hasat et", "Yabanci tuccardan getirtir"],
    longTermEffect: "famine_relief",
  },
  {
    id: "work-guard-1",
    title: "Muhafizlik Isi",
    description: "Sehir muhafizi olarak haydutlari puskurt.",
    type: "work",
    giverNpcId: null,
    objectives: [{ id: "fight", description: "Haydutlarla dovus", required: 2, tag: "fight:any" }],
    rewardGold: 30,
    solutions: ["Dovus", "Devriye", "Sessizce ikna et"],
    longTermEffect: "guard_reputation",
  },
];

export function findQuest(questId: string): CatalogQuest | null {
  return QUEST_CATALOG.find((q) => q.id === questId) ?? null;
}

interface QuestRow {
  character_id: string;
  quest_id: string;
  status: "active" | "completed" | "failed";
  progress_json: string;
  updated_day: number;
}

async function gameDay(db: SqlDatabase): Promise<number> {
  const clock = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  return clock?.game_day ?? 1;
}

/** Karakterin gorev gunlugu: katalog bilgisi + ilerleme (belge 18.3). */
export async function questLog(
  db: SqlDatabase,
  characterId: string,
): Promise<{ questId: string; title: string; status: string; stage: number; objectives: { id: string; description: string; progress: number; required: number }[] }[]> {
  const rows = await queryAll<QuestRow>(
    db,
    "SELECT character_id, quest_id, status, progress_json, updated_day FROM character_quests WHERE character_id = ? ORDER BY updated_day DESC",
    characterId,
  );
  const out = [];
  for (const row of rows) {
    const quest = findQuest(row.quest_id);
    if (!quest) continue;
    const progress = parseProgress(row.progress_json);
    out.push({
      questId: quest.id,
      title: quest.title,
      status: row.status,
      stage: 0,
      objectives: quest.objectives.map((o) => ({
        id: o.id,
        description: o.description,
        progress: progress[o.id] ?? 0,
        required: o.required,
      })),
    });
  }
  return out;
}

function parseProgress(json: string): Record<string, number> {
  try {
    const parsed = JSON.parse(json) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Goreve baslar; ayni gorev iki kez baslatilamaz. */
export async function startQuest(
  db: SqlDatabase,
  characterId: string,
  questId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const quest = findQuest(questId);
  if (!quest) return { ok: false, error: "invalid_action", detail: { reason: "unknown_quest" } };
  const existing = await queryOne<{ status: string }>(
    db,
    "SELECT status FROM character_quests WHERE character_id = ? AND quest_id = ?",
    characterId,
    questId,
  );
  if (existing) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "already_started", status: existing.status } };
  }
  const day = await gameDay(db);
  // `character_quests.quest_id` katalog tablosuna referans verir; once
  // gorev tanimi kalici hale getirilir (idempotent).
  await execute(
    db,
    `INSERT INTO quests (id, title, description, quest_type, giver_npc_id, reward_gold, status)
     VALUES (?,?,?,?,?,?, 'available')
     ON CONFLICT(id) DO NOTHING`,
    quest.id,
    quest.title,
    quest.description,
    quest.type,
    quest.giverNpcId,
    quest.rewardGold,
  );
  await execute(
    db,
    `INSERT INTO character_quests (character_id, quest_id, status, progress_json, started_day, updated_day)
     VALUES (?,?,?,?,?,?)`,
    characterId,
    questId,
    "active",
    "{}",
    day,
    day,
  );
  return { ok: true, state, detail: { questId, objectives: quest.objectives.map((o) => o.tag) } };
}

/**
 * Hedef ilerletme. Etiket gorevin tanimladigi hedeflerden biri olmali;
 * aksi halde reddedilir (belge 21.1 sunucu otoritesi).
 */
export async function advanceQuestByTag(
  db: SqlDatabase,
  characterId: string,
  tag: string,
  amount = 1,
  nowMs = Date.now(),
): Promise<number> {
  const rows = await queryAll<QuestRow>(
    db,
    "SELECT character_id, quest_id, status, progress_json, updated_day FROM character_quests WHERE character_id = ? AND status = 'active'",
    characterId,
  );
  let advanced = 0;
  const day = await gameDay(db);
  for (const row of rows) {
    const quest = findQuest(row.quest_id);
    if (!quest) continue;
    const matching = quest.objectives.filter((o) => o.tag === tag || o.tag === tag.split(":")[0] + ":any");
    if (matching.length === 0) continue;
    const progress = parseProgress(row.progress_json);
    for (const objective of matching) {
      progress[objective.id] = Math.min(objective.required, (progress[objective.id] ?? 0) + amount);
    }
    await writeProgress(db, characterId, row.quest_id, progress, day);
    advanced += 1;
  }
  void nowMs;
  return advanced;
}

async function writeProgress(
  db: SqlDatabase,
  characterId: string,
  questId: string,
  progress: Record<string, number>,
  day: number,
): Promise<void> {
  await execute(
    db,
    "UPDATE character_quests SET progress_json = ?, updated_day = ? WHERE character_id = ? AND quest_id = ?",
    JSON.stringify(progress),
    day,
    characterId,
    questId,
  );
}

/** Tamamlanmis gorevin odulunu alir: altin + uzun vadeli sonuc (belge 12.4). */
export async function claimQuestReward(
  db: SqlDatabase,
  characterId: string,
  questId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const quest = findQuest(questId);
  if (!quest) return { ok: false, error: "invalid_action", detail: { reason: "unknown_quest" } };
  const row = await queryOne<QuestRow>(
    db,
    "SELECT character_id, quest_id, status, progress_json, updated_day FROM character_quests WHERE character_id = ? AND quest_id = ?",
    characterId,
    questId,
  );
  if (!row) return { ok: false, error: "invalid_action", state, detail: { reason: "not_started" } };
  if (row.status === "completed") {
    return { ok: false, error: "invalid_action", state, detail: { reason: "already_completed" } };
  }
  const progress = parseProgress(row.progress_json);
  const cq: CharacterQuest = { characterId, questId, status: "active", progress };
  const outcome = completeQuest(cq, quest);
  if (outcome.gold <= 0) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "objectives_incomplete" } };
  }
  const day = await gameDay(db);
  await execute(
    db,
    "UPDATE character_quests SET status = 'completed', updated_day = ? WHERE character_id = ? AND quest_id = ?",
    day,
    characterId,
    questId,
  );
  state.gold += outcome.gold;
  await saveState(db, state, nowMs);
  return {
    ok: true,
    state,
    detail: { questId, gold: outcome.gold, longTermEffect: outcome.effect },
  };
}
