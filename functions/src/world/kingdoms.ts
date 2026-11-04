import type { FreeCity, Kingdom, NeutralZone } from "./types";

export const KINGDOMS: Kingdom[] = [
  {
    id: "varkhenn",
    name: "Varkhenn",
    direction: "north",
    capital: "Drahkmar",
    ruler: { name: "Kral Aldric Veyr", age: 58, dynasty: "Veyr" },
    government: "feudal_monarchy",
    crest: "Gümüş boynuzlu siyah kurt",
    houses: ["Draven", "Haldrek", "Morcant"],
    resources: ["Demir", "Kömür", "Gümüş", "Silah ve zırh"],
  },
  {
    id: "aurelith",
    name: "Aurelith",
    direction: "west",
    capital: "Velmora",
    ruler: { name: "Kraliçe Seraphine Valeris", age: 46, dynasty: "Valeris" },
    government: "council_monarchy",
    crest: "Altın güneş önünde beyaz gemi",
    houses: ["Merovain", "Thalor", "Edevane"],
    resources: ["Deniz ticareti", "Gemi yapımı", "Balıkçılık", "Lüks mallar"],
  },
  {
    id: "solmerya",
    name: "Solmerya",
    direction: "south",
    capital: "Amsyra",
    ruler: { name: "Kral Edric Solvar", age: 52, dynasty: "Solvar" },
    government: "absolute_monarchy",
    crest: "Altın başaklarla çevrili kırmızı güneş",
    houses: ["Arven", "Belmor", "Deyrath"],
    resources: ["Tahıl", "Üzüm", "Zeytin", "Hayvancılık", "At yetiştiriciliği"],
  },
  {
    id: "eryndor",
    name: "Eryndor",
    direction: "east",
    capital: "Itheryn",
    ruler: { name: "Kraliçe Maerwynn Elaris", age: 41, dynasty: "Elaris" },
    government: "elective_monarchy",
    crest: "Gümüş ay önünde açık kitap",
    houses: ["Vaelthorn", "Iskaryn", "Otheryn"],
    resources: ["Eğitim ve araştırma", "Zanaatkârlık", "Tıp ve şifacılık", "Büyü bilgisi"],
  },
  {
    id: "caelvar",
    name: "Caelvar",
    direction: "central",
    capital: "Caerthas",
    ruler: { name: "Kral Theron Caelmont", age: 49, dynasty: "Caelmont" },
    government: "noble_council_monarchy",
    crest: "Altın taç takan kırmızı kartal",
    houses: ["Ravencourt", "Valtorien", "Ashbourne"],
    resources: ["Yönetim ve bürokrasi", "Ticaret yolları", "Zanaatkârlık", "Vergiler"],
  },
];

export const FREE_CITIES: FreeCity[] = [
  { id: "ravenport", name: "Ravenport", description: "Büyük ticaret limanı olan bağımsız şehir devleti.", x: 18, y: 62 },
  { id: "thornwick", name: "Thornwick", description: "Madencilik ve zanaatkârlık merkezi olan bağımsız şehir.", x: 47, y: 22 },
  { id: "eldermere", name: "Eldermere", description: "Akademiler ve şifacılarla tanınan özgür şehir.", x: 78, y: 48 },
];

export const NEUTRAL_ZONES: NeutralZone[] = [
  { id: "ashenvale", name: "Ashenvale", description: "Tarafsız orman bölgesi.", x: 40, y: 55 },
  { id: "greywatch-pass", name: "Greywatch Pass", description: "Stratejik, tarafsız ticaret ve askerî geçit.", x: 55, y: 40 },
];
