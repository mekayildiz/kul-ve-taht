import type { Settlement, SettlementKind } from "./types";
import { HIERARCHY } from "./types";

/**
 * 130 yerlesimin tam listesi: her krallik icin 1 baskent, 3 buyuk sehir,
 * 5 kasaba, 12 koy ve 5 kale (26 x 5 = 130). Isimler krallik kimligine
 * uygun olarak ozel secilmistir; hicbiri dekoratif degildir.
 */

interface KingdomNames {
  kingdomId: string;
  capital: string;
  cities: string[];
  towns: string[];
  villages: string[];
  castles: string[];
}

const NAMES: KingdomNames[] = [
  {
    kingdomId: "varkhenn",
    capital: "Drahkmar",
    cities: ["Kaldrast", "Ironhelm", "Veyrstad"],
    towns: ["Grimhold", "Stonewatch", "Coalgate", "Barrowmere", "Nordheim"],
    villages: [
      "Ashfell", "Coldwater", "Stonecroft", "Ironbrook", "Wolfden", "Highwatch",
      "Marshend", "Deepmoor", "Cinderhollow", "Northgate", "Rockvale", "Frostmere",
    ],
    castles: ["Draven Keep", "Haldrek Watch", "Morcant Bastion", "Greywall", "Icegate"],
  },
  {
    kingdomId: "aurelith",
    capital: "Velmora",
    cities: ["Marisport", "Thaloria", "Goldharbor"],
    towns: ["Sailwick", "Merovain's Reach", "Tidemill", "Portsea", "Anchorhold"],
    villages: [
      "Saltmarsh", "Fisher's Rest", "Gulfwatch", "Pearlbay", "Westwind", "Reefside",
      "Lantern Cove", "Dockside", "Seagrass", "Tidewell", "Cliffhaven", "Wavecrest",
    ],
    castles: ["Edevane Keep", "Valeris Fort", "Seawall", "Harborwatch", "Westguard"],
  },
  {
    kingdomId: "solmerya",
    capital: "Amsyra",
    cities: ["Solvara", "Grainhall", "Equis"],
    towns: ["Wheatfield", "Vinecross", "Olivegate", "Pasture", "Harveston"],
    villages: [
      "Barleyfield", "Sunnymead", "Orchardale", "Horsestead", "Greenfurrow", "Riverbend",
      "Milbrook", "Thornhay", "Vineyard Hollow", "Warmstone", "Southfield", "Goldenrod",
    ],
    castles: ["Arven Hold", "Belmor Stud", "Deyrath Watch", "Sunspire", "Southguard"],
  },
  {
    kingdomId: "eryndor",
    capital: "Itheryn",
    cities: ["Vaelthorn", "Lorewatch", "Healersgate"],
    towns: ["Sagesrest", "Quillmark", "Starhaven", "Runesgate", "Elmscholar"],
    villages: [
      "Inkwell", "Candlewick", "Moonvale", "Herbwood", "Archivale", "Stillwater",
      "Reedmoor", "Ghostlight", "Wispwood", "Sagefield", "Parchment", "Silverglen",
    ],
    castles: ["Iskaryn Spire", "Vaelthorn Watch", "Otheryn Keep", "Eastwatch", "Moonfort"],
  },
  {
    kingdomId: "caelvar",
    capital: "Caerthas",
    cities: ["Ravencourt", "Valtoria", "Ashbourne"],
    towns: ["Crownmarket", "Crossroads", "Highcourt", "Goldgate", "Sealbridge"],
    villages: [
      "Milestone", "Taxford", "Ledgerfield", "Chancel", "Redbanner", "Stonesquare",
      "Fairmont", "Guildstead", "Pavillion", "Waymark", "Timbercross", "Hearthstone",
    ],
    castles: ["Ashbourne Keep", "Valtorien Hold", "Ravencourt Bastion", "Crownwatch", "Centerguard"],
  },
];

const OUTPUT_BY_KIND: Record<SettlementKind, string> = {
  capital: "Yönetim, büyük pazar, ana garnizon",
  city: "Bölgesel pazar, zanaat, loncalar",
  town: "Yerel pazar, han, ahır",
  village: "Birincil üretim",
  castle: "Garnizon, savunma, ikmal",
};

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Harita yerlesimi: krallik yonune gore grid dagilimi (0-100). */
const KINGDOM_ANCHOR: Record<string, { x: number; y: number }> = {
  varkhenn: { x: 50, y: 15 },
  aurelith: { x: 15, y: 50 },
  solmerya: { x: 50, y: 85 },
  eryndor: { x: 85, y: 50 },
  caelvar: { x: 50, y: 50 },
};

function build(): Settlement[] {
  const out: Settlement[] = [];
  for (const entry of NAMES) {
    const anchor = KINGDOM_ANCHOR[entry.kingdomId] ?? { x: 50, y: 50 };
    let index = 0;

    const push = (name: string, kind: SettlementKind): void => {
      const spread = (index % 6) - 3;
      const depth = Math.floor(index / 6) - 2;
      out.push({
        id: `${entry.kingdomId}-${slug(name)}`,
        name,
        kind,
        kingdomId: entry.kingdomId,
        x: Math.max(1, Math.min(99, anchor.x + spread * 3 + depth)),
        y: Math.max(1, Math.min(99, anchor.y + depth * 4 + spread)),
        primaryOutput: OUTPUT_BY_KIND[kind],
      });
      index += 1;
    };

    push(entry.capital, "capital");
    for (const n of entry.cities) push(n, "city");
    for (const n of entry.towns) push(n, "town");
    for (const n of entry.villages) push(n, "village");
    for (const n of entry.castles) push(n, "castle");
  }
  return out;
}

export const SETTLEMENTS: Settlement[] = build();

export function settlementsByKingdom(kingdomId: string): Settlement[] {
  return SETTLEMENTS.filter((s) => s.kingdomId === kingdomId);
}

export function countByKind(kingdomId: string): Record<SettlementKind, number> {
  const counts: Record<SettlementKind, number> = { capital: 0, city: 0, town: 0, village: 0, castle: 0 };
  for (const s of settlementsByKingdom(kingdomId)) counts[s.kind] += 1;
  return counts;
}

export { HIERARCHY };
