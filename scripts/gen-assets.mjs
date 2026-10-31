#!/usr/bin/env node
/**
 * Gorsel varlik ureteci (tasarim belgesi 17.2, 17.4, 17.5).
 *
 * 0 TL sarti: Hicbir varlik indirilmez. Tum gorseller YEREL olarak, kod ile
 * deterministik bicimde uretilir (procedural SVG -> WebP). Bu nedenle lisans
 * "CC0 / self" olup atif zorunlulugu yoktur; harici kaynak yoktur.
 *
 * Uretilenler:
 *  - 40 portrelik ortak havuz (20 kadin + 20 erkek tonu) + 96px turev
 *  - 7 ikon + 64px turev (game-icons.net esdegeri; yerine ozgun cizim)
 *  - 1 arma + 96px turev
 *  - 1 harita + turev
 *
 * Kullanim: node scripts/gen-assets.mjs
 */

import sharp from "sharp";
import { mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ASSETS = join(ROOT, "assets");

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Basit deterministik sozde rastgele uretic (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function portraitSvg(index) {
  const r = rng(1000 + index);
  const female = index % 2 === 0;
  const skin = ["#e8c39e", "#d9a97e", "#c68b5f", "#a9714a", "#8a5a3c"][Math.floor(r() * 5)];
  const hair = ["#2b1b12", "#4a2f1b", "#6b4423", "#8c6239", "#b08a4f", "#c9c4bd"][Math.floor(r() * 6)];
  const cloth = ["#5a3a2a", "#3a4a5a", "#4a3a4a", "#2f4a3a", "#5a4a2a"][Math.floor(r() * 5)];
  const hairShape = female
    ? `<path d="M40 34 Q60 6 100 12 Q140 6 160 34 Q168 70 150 96 Q140 60 120 52 Q60 52 40 96 Q22 70 40 34 Z" fill="${hair}"/>`
    : `<path d="M40 36 Q60 8 100 14 Q140 8 160 36 Q158 58 146 56 Q130 30 100 30 Q70 30 54 56 Q42 58 40 36 Z" fill="${hair}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#1b1512"/>
  <ellipse cx="100" cy="210" rx="86" ry="90" fill="${cloth}"/>
  ${hairShape}
  <ellipse cx="100" cy="104" rx="46" ry="56" fill="${skin}"/>
  <ellipse cx="82" cy="100" rx="6" ry="7" fill="#2a2118"/>
  <ellipse cx="118" cy="100" rx="6" ry="7" fill="#2a2118"/>
  <path d="M86 132 Q100 142 114 132" stroke="#7a4a3a" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;
}

function iconSvg(kind) {
  const common = `<rect width="128" height="128" fill="none"/>`;
  const shapes = {
    sword: `<path d="M64 8 L74 30 L70 96 L58 96 L54 30 Z" fill="#cfd6dd"/><rect x="46" y="96" width="36" height="8" fill="#8a6a3a"/><rect x="60" y="104" width="8" height="20" fill="#6b4a2a"/>`,
    shield: `<path d="M64 12 L108 30 V66 Q108 100 64 116 Q20 100 20 66 V30 Z" fill="#8a3a2a" stroke="#e0c070" stroke-width="5"/><path d="M64 34 V96" stroke="#e0c070" stroke-width="4"/>`,
    gold: `<circle cx="64" cy="64" r="38" fill="#e0c070" stroke="#a8842a" stroke-width="5"/><text x="64" y="80" font-size="46" text-anchor="middle" fill="#7a5a18" font-family="serif">₲</text>`,
    crown: `<path d="M22 96 L34 40 L52 70 L64 32 L76 70 L94 40 L106 96 Z" fill="#e0c070" stroke="#a8842a" stroke-width="4"/><rect x="22" y="96" width="84" height="14" fill="#c9a227"/>`,
    scroll: `<rect x="34" y="20" width="60" height="88" rx="4" fill="#efe3c2" stroke="#b8a274" stroke-width="3"/><path d="M44 40 H84 M44 56 H84 M44 72 H76" stroke="#8a7a52" stroke-width="4"/>`,
    horse: `<path d="M40 100 Q40 60 66 44 Q60 30 72 22 Q84 34 82 46 Q104 58 104 100 Z" fill="#5a3a22"/><circle cx="70" cy="40" r="4" fill="#2a1a10"/>`,
    heart: `<path d="M64 108 C20 78 26 40 52 40 C62 40 64 50 64 50 C64 50 66 40 76 40 C102 40 108 78 64 108 Z" fill="#a8342a"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${common}${shapes[kind]}</svg>`;
}

function crestSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <path d="M96 16 L168 48 V104 Q168 152 96 176 Q24 152 24 104 V48 Z" fill="#2f2a24" stroke="#c9a227" stroke-width="8"/>
  <path d="M96 60 L128 76 L120 112 L72 112 L64 76 Z" fill="#c9a227"/>
</svg>`;
}

function mapSvg() {
  const r = rng(7);
  let ridges = "";
  for (let i = 0; i < 14; i += 1) {
    const x = Math.floor(r() * 900) + 50;
    const y = Math.floor(r() * 500) + 80;
    ridges += `<path d="M${x} ${y} l40 -46 l40 46 Z" fill="#4a4038"/>`;
  }
  let roads = "";
  for (let i = 0; i < 10; i += 1) {
    const x1 = Math.floor(r() * 900) + 50;
    const y1 = Math.floor(r() * 500) + 80;
    roads += `<line x1="${x1}" y1="${y1}" x2="${x1 + 120}" y2="${y1 + 60}" stroke="#7a6a4a" stroke-width="3"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="640" viewBox="0 0 1000 640">
  <rect width="1000" height="640" fill="#241f1a"/>
  <rect x="30" y="30" width="940" height="580" fill="#2f2820" stroke="#c9a227" stroke-width="4"/>
  ${ridges}
  ${roads}
</svg>`;
}

async function writeWebp(svg, outPath, width) {
  ensureDir(join(outPath, ".."));
  const buf = await sharp(Buffer.from(svg)).resize(width).webp({ quality: 82 }).toBuffer();
  writeFileSync(outPath, buf);
  return buf.length;
}

async function main() {
  ensureDir(join(ASSETS, "portraits"));
  ensureDir(join(ASSETS, "icons"));
  ensureDir(join(ASSETS, "crests"));
  ensureDir(join(ASSETS, "maps"));

  const produced = [];
  for (let i = 0; i < 40; i += 1) {
    const key = String(i).padStart(2, "0");
    await writeWebp(portraitSvg(i), join(ASSETS, "portraits", `pool-${key}.webp`), 256);
    await writeWebp(portraitSvg(i), join(ASSETS, "portraits", `pool-${key}-96.webp`), 96);
    produced.push(`portraits/pool-${key}.webp`);
  }

  for (const kind of ["sword", "shield", "gold", "crown", "scroll", "horse", "heart"]) {
    await writeWebp(iconSvg(kind), join(ASSETS, "icons", `${kind}.webp`), 128);
    await writeWebp(iconSvg(kind), join(ASSETS, "icons", `${kind}-64.webp`), 64);
    produced.push(`icons/${kind}.webp`);
  }

  await writeWebp(crestSvg(), join(ASSETS, "crests", "neutral.webp"), 192);
  await writeWebp(crestSvg(), join(ASSETS, "crests", "neutral-96.webp"), 96);
  produced.push("crests/neutral.webp");

  await writeWebp(mapSvg(), join(ASSETS, "maps", "valedorn.webp"), 1000);
  await writeWebp(mapSvg(), join(ASSETS, "maps", "valedorn-thumb.webp"), 320);
  produced.push("maps/valedorn.webp");

  // manifest.json'daki varliklarin dosyalari gercekten var mi dogrula.
  const manifest = JSON.parse(readFileSync(join(ASSETS, "manifest.json"), "utf8"));
  const missing = [];
  for (const asset of manifest.assets) {
    for (const rel of [asset.r2Key, asset.thumbnailKey].filter(Boolean)) {
      if (rel.includes("{")) continue;
      if (!existsSync(join(ASSETS, rel))) missing.push(rel);
    }
  }

  const total = produced.reduce((sum, rel) => {
    const st = statSync(join(ASSETS, rel));
    return sum + st.size;
  }, 0);

  console.log(`Uretilen dosya: ${produced.length + 1} dosya (yaklasik ${(total / 1024).toFixed(1)} KB)`);
  if (missing.length > 0) {
    console.log(`Manifestte eksik dosya: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("Tum manifest dosyalari mevcut. Lisans: CC0/self (atif gerekmez).");
}

main();
