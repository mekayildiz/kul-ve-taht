/**
 * Dogum yeri bilgi paneli (tasarim belgesi 5.1).
 *
 * Oyuncu dogum yerini secmeden ONCE karsilastirilabilir bir panel gorur:
 * cografya/iklim, bolgesel ekonomi, siyasi durum, askeri durum, toplumsal
 * yapi, egitim-meslek firsatlari, baslangic ARTILARI ve EKSILERI.
 *
 * Panel, yerlesim + krallik verisinden TURETILIR; elle yazilmis metin
 * cogaltilmaz. Boylece 130 yerlesimin tamami icin panel uretilir ve veri
 * tek kaynaktan guncellenir.
 */

import { KINGDOMS, FREE_CITIES, NEUTRAL_ZONES } from "./kingdoms";
import { SETTLEMENTS } from "./settlements";
import type { SettlementKind } from "./types";

export interface BirthplacePanel {
  settlementId: string;
  name: string;
  kind: SettlementKind;
  kingdomId: string;
  kingdomName: string;
  geography: string;
  climate: string;
  economy: string;
  politicalSituation: string;
  militarySituation: string;
  socialStructure: string;
  opportunities: string[];
  advantages: string[];
  disadvantages: string[];
}

const DIRECTION_CLIMATE: Record<string, string> = {
  north: "Sert kışlar, kısa yazlar; kar ve don sık.",
  west: "Ilıman ve nemli; deniz etkisi güçlü, sis ve yağış yaygın.",
  south: "Sıcak ve kurak yazlar; uzun ürün mevsimi.",
  east: "Ilıman karasal; bilgi ve zanaat merkezlerine yakın.",
  central: "Kararlı ve ölçülü; ticaret yollarının kavşağı.",
};

const KIND_GEOGRAPHY: Record<SettlementKind, string> = {
  capital: "Geniş düzlük ve yönetim çevresi; ana yollar buraya bağlanır.",
  city: "Bölgesel kavşak; pazar ve zanaat alanları gelişmiştir.",
  town: "Kırsal ile şehir arasında geçiş noktası; yerel pazar çevresi.",
  village: "Kırsal arazi; tarım, orman veya maden çevresi.",
  castle: "Stratejik geçit, yol veya sınır üzerinde savunma konumu.",
};

const KIND_OPPORTUNITIES: Record<SettlementKind, string[]> = {
  capital: ["Saray ve bürokrasi", "Büyük pazar ticareti", "Yüksek eğitim kurumları"],
  city: ["Lonca üyeliği", "Zanaat ve üretim", "Bölgesel ticaret"],
  town: ["Yerel zanaat", "Han ve kervan işleri", "Muhafız hizmeti"],
  village: ["Tarım ve hayvancılık", "Ormancılık veya madencilik", "Avcılık ve keşif"],
  castle: ["Askerî eğitim", "Komuta ve garnizon", "İkmal ve depo yönetimi"],
};

const KIND_SOCIAL: Record<SettlementKind, string> = {
  capital: "Soylular, bürokratlar, zanaatkârlar ve hizmetliler bir arada.",
  city: "Güçlü loncalar, tüccar aileler ve işçi sınıfı.",
  town: "Zanaatkârlar, esnaf ve çevre köylüler.",
  village: "Yerel aileler, çiftçiler ve köy yöneticisi.",
  castle: "Askerler, subaylar ve kale sahibinin hane halkı.",
};

function kingdomOf(kingdomId: string): (typeof KINGDOMS)[number] | undefined {
  return KINGDOMS.find((k) => k.id === kingdomId);
}

export function birthplacePanel(settlementId: string): BirthplacePanel | null {
  const settlement = SETTLEMENTS.find((s) => s.id === settlementId);
  if (!settlement) return null;
  const kingdom = kingdomOf(settlement.kingdomId);
  const direction = kingdom?.direction ?? "central";
  const government = kingdom?.government ?? "noble_council_monarchy";
  const resources = kingdom?.resources ?? [];

  const advantages = [...KIND_OPPORTUNITIES[settlement.kind]];
  if (settlement.kind === "capital") advantages.push("Yüksek siyasi erişim ve itibar fırsatı");
  if (settlement.kind === "village") advantages.push("Dayanıklılık ve üretim becerilerinde hızlı gelişim");
  if (settlement.kind === "castle") advantages.push("Güçlü askerî disiplin ve savunma bilgisi");

  const disadvantages: string[] = [];
  if (direction === "north") disadvantages.push("Sert iklim: gıda çeşitliliği ve üretim mevsimi sınırlı");
  if (direction === "south") disadvantages.push("Sıcak kuraklık dönemlerinde su ve ürün riski");
  if (settlement.kind === "village") disadvantages.push("Sınırlı hizmet, eğitim ve sağlık erişimi");
  if (settlement.kind === "castle") disadvantages.push("Askerî yükümlülük ve sıkı hiyerarşi");
  if (settlement.kind === "town") disadvantages.push("Sınırlı büyük ölçekli ticaret ve yatırım imkânı");
  if (disadvantages.length === 0) disadvantages.push("Yüksek rekabet ve yaşam maliyeti");

  return {
    settlementId: settlement.id,
    name: settlement.name,
    kind: settlement.kind,
    kingdomId: settlement.kingdomId,
    kingdomName: kingdom?.name ?? settlement.kingdomId,
    geography: KIND_GEOGRAPHY[settlement.kind],
    climate: DIRECTION_CLIMATE[direction] ?? DIRECTION_CLIMATE.central!,
    economy: `${settlement.primaryOutput}${resources.length ? `; krallık kaynakları: ${resources.join(", ")}` : ""}`,
    politicalSituation: `${kingdom?.name ?? settlement.kingdomId} yönetimi (${government}).`,
    militarySituation:
      settlement.kind === "castle"
        ? "Yüksek garnizon ve savunma kapasitesi."
        : settlement.kind === "capital"
          ? "Ana garnizon ve düzenli devriyeler."
          : "Yerel muhafız gücü ve düzenli olmayan devriyeler.",
    socialStructure: KIND_SOCIAL[settlement.kind],
    opportunities: KIND_OPPORTUNITIES[settlement.kind],
    advantages,
    disadvantages,
  };
}

/** Tum dogum yeri panellerini uretir (5 krallik x 26 + bagimsiz/tarafsiz). */
export function allBirthplacePanels(): BirthplacePanel[] {
  const panels: BirthplacePanel[] = [];
  for (const settlement of SETTLEMENTS) {
    const panel = birthplacePanel(settlement.id);
    if (panel) panels.push(panel);
  }
  return panels;
}

/** Harita verisi (tasarim belgesi 4): yerlesimler + bagimsiz sehirler + tarafsiz bolgeler. */
export interface MapData {
  settlements: typeof SETTLEMENTS;
  freeCities: typeof FREE_CITIES;
  neutralZones: typeof NEUTRAL_ZONES;
  kingdoms: typeof KINGDOMS;
}

export function mapData(): MapData {
  return { settlements: SETTLEMENTS, freeCities: FREE_CITIES, neutralZones: NEUTRAL_ZONES, kingdoms: KINGDOMS };
}
