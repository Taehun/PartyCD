// 전투 로그 라인 파서 — 순수 함수
// 입력: WoWCombatLog-*.txt 한 줄
// 출력: 관심 이벤트면 normalized object, 아니면 null

import { SpellData, AuraToSpell } from "./spells.js";

// COMBATLOG_OBJECT_AFFILIATION_*
const AFFIL_MINE  = 0x1;
const AFFIL_PARTY = 0x2;
const AFFIL_RAID  = 0x4;
const AFFIL_MASK  = AFFIL_MINE | AFFIL_PARTY | AFFIL_RAID;

// 공통 prefix 필드 인덱스 (이벤트 이름 제외, 0-based)
// 0:sourceGUID 1:sourceName 2:sourceFlags 3:sourceRaidFlags
// 4:destGUID   5:destName   6:destFlags   7:destRaidFlags
// 8:spellId    9:spellName  10:spellSchool
const IDX_SOURCE_NAME = 1;
const IDX_SOURCE_FLAGS = 2;
const IDX_SPELL_ID = 8;

export function parseLine(line) {
  if (!line) return null;

  // 타임스탬프와 이벤트 본문은 2-space로 구분
  const sepIdx = line.indexOf("  ");
  if (sepIdx < 0) return null;

  const tsStr = line.slice(0, sepIdx);
  const rest = line.slice(sepIdx + 2);

  // 첫 콤마 전까지가 이벤트 이름
  const firstComma = rest.indexOf(",");
  if (firstComma < 0) return null;

  const eventName = rest.slice(0, firstComma);
  if (
    eventName !== "SPELL_CAST_SUCCESS" &&
    eventName !== "SPELL_AURA_APPLIED" &&
    eventName !== "SPELL_INTERRUPT"
  ) {
    return null;
  }

  const fields = splitCsv(rest.slice(firstComma + 1));
  if (fields.length < IDX_SPELL_ID + 1) return null;

  const sourceFlags = parseHex(fields[IDX_SOURCE_FLAGS]);
  if (!(sourceFlags & AFFIL_MASK)) return null; // 파티/레이드/본인 아님

  const rawSourceName = fields[IDX_SOURCE_NAME];
  if (!rawSourceName) return null;
  const player = stripRealm(rawSourceName);

  const spellIdRaw = Number(fields[IDX_SPELL_ID]);
  if (!Number.isFinite(spellIdRaw)) return null;

  // SPELL_AURA_APPLIED는 auraSpellID로 기록되므로 원본 spellID로 역매핑
  let spellId = spellIdRaw;
  let type;
  if (eventName === "SPELL_CAST_SUCCESS") {
    type = "cast";
  } else if (eventName === "SPELL_AURA_APPLIED") {
    // auraType은 마지막 필드 (adv logging이 SPELL_AURA_APPLIED에 extra field 추가 안 함)
    const auraType = fields[fields.length - 1];
    if (auraType !== "BUFF") return null;
    // auraSpellID → 원본 스펠 역매핑
    const mapped = AuraToSpell[spellIdRaw];
    if (!mapped) return null;
    spellId = mapped;
    type = "aura";
  } else {
    // SPELL_INTERRUPT — sourceSpellId는 인터럽터 스펠, extraSpellId는 끊은 대상 스펠
    type = "interrupt";
  }

  const spell = SpellData[spellId];
  if (!spell) return null;

  const timestamp = parseTimestamp(tsStr);

  const out = {
    type,
    player,
    class: spell.class,
    spellId,
    timestamp,
  };

  if (type === "interrupt") {
    // extraSpellId는 공통 prefix(11) 이후 인덱스 11
    const extraIdx = 11;
    if (fields.length > extraIdx + 1) {
      out.targetSpellId = Number(fields[extraIdx]);
      out.targetSpellName = fields[extraIdx + 1];
    }
  }

  return out;
}

// -------- helpers --------

// 따옴표 안 쉼표를 존중하는 CSV splitter
export function splitCsv(str) {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue; // 따옴표 문자 자체는 제외
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
  const n = Number(str); // "0x..." 접두어를 Number가 처리
  return Number.isFinite(n) ? n : 0;
}

// "Taehun-Azshara" → "Taehun"
function stripRealm(name) {
  const dash = name.indexOf("-");
  return dash < 0 ? name : name.slice(0, dash);
}

// "4/11 20:13:42.123-4" 또는 "4/11 20:13:42.123" → epoch ms
export function parseTimestamp(str) {
  // TZ 접미어 제거
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
