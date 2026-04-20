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
const IDX_SOURCE_NAME = 1;
const IDX_SOURCE_FLAGS = 2;
const IDX_DEST_NAME = 5;
const IDX_DEST_FLAGS = 6;
const IDX_SPELL_ID = 8;
const IDX_SPELL_NAME = 9;
const IDX_AURA_TYPE = 11;     // SPELL_AURA_APPLIED: prefix(8) + spell(3) → auraType는 항상 인덱스 11

// advanced logging payload는 spell prefix 직후 17개 필드.
// 첫 필드(infoGUID)는 항상 GUID — Player-/Creature-/Pet-/Vehicle-/Vignette- 등의 prefix를 가진다.
const ADVANCED_PAYLOAD_LEN = 17;
const GUID_RE = /^(Player|Creature|Pet|Vehicle|GameObject|Vignette)-/;

const SPELL_EVENTS = new Set([
  "SPELL_CAST_SUCCESS",
  "SPELL_AURA_APPLIED",
  "SPELL_DAMAGE",
  "SPELL_PERIODIC_DAMAGE",
  "RANGE_DAMAGE",
  "SPELL_INSTAKILL",
]);

const NON_SPELL_EVENTS = new Set([
  "UNIT_DIED",
  "ENCOUNTER_START",
  "ENCOUNTER_END",
  "SWING_DAMAGE",
  "SWING_DAMAGE_LANDED",
  "ENVIRONMENTAL_DAMAGE",
]);

export function parseLine(line) {
  if (!line) return null;
  // Windows CRLF 방어 — 파일 분할이 \n만 기준이면 라인 끝에 \r이 남음.
  if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
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
    // UNIT_DIED,sourceGUID,sourceName,sourceFlags,sourceRaidFlags,destGUID,destName,destFlags,destRaidFlags[,recapID]
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

  if (eventName === "SPELL_INSTAKILL") {
    // SPELL_INSTAKILL,prefix(8),spell(3) — 즉사 메커닉 (예: 광폭화 와이프).
    if (fields.length < IDX_SPELL_ID + 1) return null;
    const destFlags = parseHex(fields[IDX_DEST_FLAGS]);
    if (!(destFlags & AFFIL_MASK)) return null;
    if (!(destFlags & TYPE_PLAYER)) return null;
    const destName = fields[IDX_DEST_NAME];
    if (!destName) return null;
    return {
      type: "damage",
      timestamp,
      target: stripRealm(destName),
      sourceName: stripRealm(fields[IDX_SOURCE_NAME] ?? "") || "Environment",
      spellName: fields[IDX_SPELL_NAME] ?? "Instakill",
      amount: 0,
      overkill: 1,            // 즉사는 항상 킬링 블로우로 취급
      instakill: true,
    };
  }

  if (eventName === "SWING_DAMAGE" || eventName === "SWING_DAMAGE_LANDED") {
    // 처음 8개 prefix + (advanced 17 옵션) + amount, base, overkill, school, resisted, blocked, absorbed, critical, ...
    const destFlags = parseHex(fields[IDX_DEST_FLAGS]);
    if (!(destFlags & AFFIL_MASK)) return null;
    if (!(destFlags & TYPE_PLAYER)) return null;
    const destName = fields[IDX_DEST_NAME];
    if (!destName) return null;
    const dmg = extractDamage(fields, 8);
    if (!dmg) return null;
    return {
      type: "damage",
      timestamp,
      target: stripRealm(destName),
      sourceName: stripRealm(fields[IDX_SOURCE_NAME] ?? "") || "Melee",
      spellName: "Melee",
      amount: dmg.amount,
      overkill: dmg.overkill,
    };
  }

  if (eventName === "ENVIRONMENTAL_DAMAGE") {
    // ENVIRONMENTAL_DAMAGE,prefix(8),environmentalType,amount,base,overkill,school,...
    const destFlags = parseHex(fields[IDX_DEST_FLAGS]);
    if (!(destFlags & AFFIL_MASK)) return null;
    if (!(destFlags & TYPE_PLAYER)) return null;
    const destName = fields[IDX_DEST_NAME];
    if (!destName) return null;
    // environmentalType은 prefix 직후 인덱스 8에 위치 (advanced payload는 환경 데미지에는 보통 포함되지 않으나 방어적으로 검사).
    const envType = fields[8] ?? "Environment";
    const dmg = extractDamage(fields, 9);
    if (!dmg) return null;
    return {
      type: "damage",
      timestamp,
      target: stripRealm(destName),
      sourceName: prettyEnvironmentalType(envType),
      spellName: prettyEnvironmentalType(envType),
      amount: dmg.amount,
      overkill: dmg.overkill,
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
    const dmg = extractDamage(fields, IDX_SPELL_ID + 3);
    if (!dmg) return null;
    return {
      type: "damage",
      timestamp,
      target: stripRealm(destName),
      sourceName: stripRealm(rawSourceName ?? ""),
      spellName: fields[IDX_SPELL_NAME] ?? "",
      amount: dmg.amount,
      overkill: dmg.overkill,
      periodic: eventName === "SPELL_PERIODIC_DAMAGE",
    };
  }

  // SPELL_CAST_SUCCESS / SPELL_AURA_APPLIED
  if (!(sourceFlags & AFFIL_MASK)) return null;
  if (!rawSourceName) return null;
  const player = stripRealm(rawSourceName);

  const spellIdRaw = Number(fields[IDX_SPELL_ID]);
  if (!Number.isFinite(spellIdRaw)) return null;

  let spellId = spellIdRaw;
  let type;
  if (eventName === "SPELL_CAST_SUCCESS") {
    type = "cast";
  } else { // SPELL_AURA_APPLIED
    // 흡수 보호막 등은 BUFF 뒤에 amount 필드가 추가됨. 항상 인덱스 11에서 읽는다.
    const auraType = fields[IDX_AURA_TYPE];
    if (auraType !== "BUFF") return null;
    const mapped = AuraToSpell[spellIdRaw];
    if (!mapped) return null;
    spellId = mapped;
    type = "aura";
  }

  const spell = SpellData[spellId];
  if (!spell) return null;

  return {
    type,
    player,
    class: spell.class,
    spellId,
    timestamp,
  };
}

// ============================================================
// damage 페이로드 파서
// ============================================================
// advanced logging 여부를 첫 advanced 필드(infoGUID)의 GUID 패턴으로 판별.
// suffixStart는 spell prefix 직후 인덱스 (= 11 for SPELL_DAMAGE, 8 for SWING_DAMAGE, 9 for ENVIRONMENTAL_DAMAGE)
// returns { amount, overkill } | null
function extractDamage(fields, suffixStart) {
  const advancedHere = fields.length > suffixStart && GUID_RE.test(fields[suffixStart] ?? "");
  const dmgIdx = advancedHere ? suffixStart + ADVANCED_PAYLOAD_LEN : suffixStart;
  if (dmgIdx >= fields.length) return null;
  const amount = Number(fields[dmgIdx]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  // amount, baseAmount, overkill — overkill은 +2 위치
  const overkillRaw = fields[dmgIdx + 2];
  let overkill = Number(overkillRaw);
  if (!Number.isFinite(overkill)) overkill = 0;
  return { amount, overkill };
}

function prettyEnvironmentalType(t) {
  // WoW envType 값 예: Falling, Drowning, Fatigue, Fire, Lava, Slime
  if (!t) return "Environment";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
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
