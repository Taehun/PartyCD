// 전투 로그 라인 파서 — 순수 함수
// 입력: WoWCombatLog-*.txt 한 줄
// 출력: 관심 이벤트면 normalized object, 아니면 null

import { SpellData, AuraToSpell } from "./spells.js";

// COMBATLOG_OBJECT_AFFILIATION_*
const AFFIL_MINE  = 0x1;
const AFFIL_PARTY = 0x2;
const AFFIL_RAID  = 0x4;
const AFFIL_MASK  = AFFIL_MINE | AFFIL_PARTY | AFFIL_RAID;

// COMBATLOG_OBJECT_TYPE_PLAYER
const TYPE_PLAYER = 0x400;

// 공통 prefix 필드 인덱스 (이벤트 이름 제외, 0-based)
// 0:sourceGUID 1:sourceName 2:sourceFlags 3:sourceRaidFlags
// 4:destGUID   5:destName   6:destFlags   7:destRaidFlags
// 8:spellId    9:spellName  10:spellSchool
const IDX_SOURCE_GUID = 0;
const IDX_SOURCE_NAME = 1;
const IDX_SOURCE_FLAGS = 2;
const IDX_DEST_GUID = 4;
const IDX_DEST_NAME = 5;
const IDX_DEST_FLAGS = 6;
const IDX_SPELL_ID = 8;
const IDX_SPELL_NAME = 9;

const SPELL_EVENTS = new Set([
  "SPELL_CAST_SUCCESS",
  "SPELL_AURA_APPLIED",
  "SPELL_INTERRUPT",
  "SPELL_DAMAGE",
  "SPELL_PERIODIC_DAMAGE",
  "RANGE_DAMAGE",
]);

const NON_SPELL_EVENTS = new Set([
  "UNIT_DIED",
  "ENCOUNTER_START",
  "ENCOUNTER_END",
  "SWING_DAMAGE",
  "SWING_DAMAGE_LANDED",
]);

export function parseLine(line) {
  if (!line) return null;

  const sepIdx = line.indexOf("  ");
  if (sepIdx < 0) return null;

  const tsStr = line.slice(0, sepIdx);
  const rest = line.slice(sepIdx + 2);

  const firstComma = rest.indexOf(",");
  if (firstComma < 0) return null;

  const eventName = rest.slice(0, firstComma);
  if (!SPELL_EVENTS.has(eventName) && !NON_SPELL_EVENTS.has(eventName)) {
    return null;
  }

  const fields = splitCsv(rest.slice(firstComma + 1));
  const timestamp = parseTimestamp(tsStr);

  if (eventName === "ENCOUNTER_START") {
    // ENCOUNTER_START,encounterID,"encounterName",difficultyID,groupSize,instanceID
    return {
      type: "encounter_start",
      timestamp,
      encounterId: Number(fields[0]),
      encounterName: fields[1] ?? "",
    };
  }

  if (eventName === "ENCOUNTER_END") {
    // ENCOUNTER_END,encounterID,"encounterName",difficultyID,groupSize,success,fightTime
    return {
      type: "encounter_end",
      timestamp,
      encounterId: Number(fields[0]),
      encounterName: fields[1] ?? "",
      success: fields[4] === "1",
    };
  }

  if (eventName === "UNIT_DIED") {
    // UNIT_DIED,sourceGUID,sourceName,sourceFlags,sourceRaidFlags,destGUID,destName,destFlags,destRaidFlags
    const destFlags = parseHex(fields[IDX_DEST_FLAGS]);
    if (!(destFlags & AFFIL_MASK)) return null;
    if (!(destFlags & TYPE_PLAYER)) return null;
    const destName = fields[IDX_DEST_NAME];
    if (!destName) return null;
    return {
      type: "death",
      timestamp,
      player: stripRealm(destName),
    };
  }

  if (eventName === "SWING_DAMAGE" || eventName === "SWING_DAMAGE_LANDED") {
    // SWING_DAMAGE,sourceGUID,sourceName,sourceFlags,sourceRaidFlags,destGUID,destName,destFlags,destRaidFlags,advanced...amount,...
    const destFlags = parseHex(fields[IDX_DEST_FLAGS]);
    if (!(destFlags & AFFIL_MASK)) return null;
    if (!(destFlags & TYPE_PLAYER)) return null;
    const destName = fields[IDX_DEST_NAME];
    if (!destName) return null;
    // SWING events: 처음 8개 필드 + advanced(17개) + amount, base, overkill, ...
    // amount는 advanced 직후 첫 숫자. 단순화: 뒤에서부터 추적.
    const amount = extractDamageAmount(fields, 8);
    if (amount == null) return null;
    return {
      type: "damage",
      timestamp,
      target: stripRealm(destName),
      sourceName: stripRealm(fields[IDX_SOURCE_NAME] ?? ""),
      spellName: "Melee",
      amount,
    };
  }

  // SPELL_* events: 공통 prefix + spellId, spellName, spellSchool
  if (fields.length < IDX_SPELL_ID + 1) return null;

  const sourceFlags = parseHex(fields[IDX_SOURCE_FLAGS]);
  const destFlags = parseHex(fields[IDX_DEST_FLAGS]);
  const rawSourceName = fields[IDX_SOURCE_NAME];

  if (eventName === "SPELL_DAMAGE" || eventName === "SPELL_PERIODIC_DAMAGE" || eventName === "RANGE_DAMAGE") {
    if (!(destFlags & AFFIL_MASK)) return null;
    if (!(destFlags & TYPE_PLAYER)) return null;
    const destName = fields[IDX_DEST_NAME];
    if (!destName) return null;
    const amount = extractDamageAmount(fields, IDX_SPELL_ID + 3);
    if (amount == null) return null;
    return {
      type: "damage",
      timestamp,
      target: stripRealm(destName),
      sourceName: stripRealm(rawSourceName ?? ""),
      spellName: fields[IDX_SPELL_NAME] ?? "",
      amount,
      periodic: eventName === "SPELL_PERIODIC_DAMAGE",
    };
  }

  // SPELL_CAST_SUCCESS / SPELL_AURA_APPLIED / SPELL_INTERRUPT
  if (!(sourceFlags & AFFIL_MASK)) return null;
  if (!rawSourceName) return null;
  const player = stripRealm(rawSourceName);

  const spellIdRaw = Number(fields[IDX_SPELL_ID]);
  if (!Number.isFinite(spellIdRaw)) return null;

  let spellId = spellIdRaw;
  let type;
  if (eventName === "SPELL_CAST_SUCCESS") {
    type = "cast";
  } else if (eventName === "SPELL_AURA_APPLIED") {
    const auraType = fields[fields.length - 1];
    if (auraType !== "BUFF") return null;
    const mapped = AuraToSpell[spellIdRaw];
    if (!mapped) return null;
    spellId = mapped;
    type = "aura";
  } else {
    type = "interrupt";
  }

  const spell = SpellData[spellId];
  if (!spell) return null;

  const out = {
    type,
    player,
    class: spell.class,
    spellId,
    timestamp,
  };

  if (type === "interrupt") {
    const extraIdx = 11;
    if (fields.length > extraIdx + 1) {
      out.targetSpellId = Number(fields[extraIdx]);
      out.targetSpellName = fields[extraIdx + 1];
    }
  }

  return out;
}

// advanced logging이 켜져 있으면 spell prefix 뒤에 17개의 advanced 필드가 들어옴.
// amount 후보를 뒤에서부터 스캔: 큰 정수 + 그 뒤에 다른 정수가 이어지면 amount로 간주.
// 단순화: spell prefix 뒤 첫 큰 숫자를 amount로 본다.
function extractDamageAmount(fields, suffixStart) {
  // 시도 1: advanced logging on이면 suffixStart + 17 위치가 amount
  // 시도 2: advanced off면 suffixStart 위치가 amount
  const candidates = [suffixStart + 17, suffixStart];
  for (const idx of candidates) {
    if (idx >= fields.length) continue;
    const v = Number(fields[idx]);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return null;
}

// -------- helpers --------

export function splitCsv(str) {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (c === "," && !inQuote) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function parseHex(str) {
  if (!str) return 0;
  const n = Number(str);
  return Number.isFinite(n) ? n : 0;
}

function stripRealm(name) {
  const dash = name.indexOf("-");
  return dash < 0 ? name : name.slice(0, dash);
}

export function parseTimestamp(str) {
  const tzMatch = str.match(/^(.+?)([+-]\d+)?$/);
  const core = tzMatch ? tzMatch[1] : str;

  const spaceIdx = core.indexOf(" ");
  if (spaceIdx < 0) return Date.now();

  const datePart = core.slice(0, spaceIdx);
  const timePart = core.slice(spaceIdx + 1);

  const dateBits = datePart.split("/").map(Number);
  let month, day, year;
  if (dateBits.length === 2) {
    [month, day] = dateBits;
    year = new Date().getFullYear();
  } else if (dateBits.length === 3) {
    [month, day, year] = dateBits;
    if (year < 100) year += 2000;
  } else {
    return Date.now();
  }

  const [hhStr, mmStr, secStr] = timePart.split(":");
  const hh = Number(hhStr);
  const mm = Number(mmStr);
  const [ssStr, msStr = "0"] = secStr.split(".");
  const ss = Number(ssStr);
  const ms = Number(msStr);

  return new Date(year, month - 1, day, hh, mm, ss, ms).getTime();
}
