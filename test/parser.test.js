import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLine, splitCsv, parseTimestamp } from "../parser.js";

// -------- splitCsv --------
test("splitCsv: basic", () => {
  assert.deepEqual(splitCsv("a,b,c"), ["a", "b", "c"]);
});

test("splitCsv: quoted comma", () => {
  assert.deepEqual(
    splitCsv('a,"Smith, Jr.",c'),
    ["a", "Smith, Jr.", "c"],
  );
});

test("splitCsv: empty fields", () => {
  assert.deepEqual(splitCsv("a,,c"), ["a", "", "c"]);
});

// -------- parseTimestamp --------
test("parseTimestamp: basic without TZ", () => {
  const ts = parseTimestamp("4/11 20:13:42.123");
  const d = new Date(ts);
  assert.equal(d.getMonth(), 3); // April
  assert.equal(d.getDate(), 11);
  assert.equal(d.getHours(), 20);
  assert.equal(d.getMinutes(), 13);
  assert.equal(d.getSeconds(), 42);
  assert.equal(d.getMilliseconds(), 123);
});

test("parseTimestamp: with TZ suffix", () => {
  const ts = parseTimestamp("4/11 20:13:42.123-4");
  const d = new Date(ts);
  assert.equal(d.getMonth(), 3);
  assert.equal(d.getDate(), 11);
  assert.equal(d.getSeconds(), 42);
});

// -------- parseLine --------

function buildLine(eventName, { sourceFlags = "0x512", sourceName = "Taehun-Azshara", spellId, spellName = "Spell", extra = "" }) {
  const prefix = `Player-1-0001,"${sourceName}",${sourceFlags},0x0,0000000000000000,nil,0x80000000,0x80000000`;
  const spellPart = `${spellId},"${spellName}",0x1`;
  const tail = extra ? `,${extra}` : "";
  return `4/11 20:13:42.123  ${eventName},${prefix},${spellPart}${tail}`;
}

// ===== SURVIVAL (외부 생존기) =====

test("SPELL_CAST_SUCCESS + 파티 플래그 → SURVIVAL cast", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { spellId: 33206, spellName: "Pain Suppression" });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "cast");
  assert.equal(ev.player, "Taehun");
  assert.equal(ev.class, "PRIEST");
  assert.equal(ev.spellId, 33206);
});

test("SPELL_CAST_SUCCESS + 본인(MINE) 플래그 → 통과", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { sourceFlags: "0x511", spellId: 633, spellName: "Lay on Hands" });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.class, "PALADIN");
});

test("SPELL_CAST_SUCCESS + 레이드 플래그 → 통과", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { sourceFlags: "0x514", spellId: 98008, spellName: "Spirit Link Totem" });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.class, "SHAMAN");
});

test("SPELL_CAST_SUCCESS + 외부인(OUTSIDER) 플래그 → drop", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { sourceFlags: "0x518", spellId: 33206 });
  assert.equal(parseLine(line), null);
});

test("추적 대상이 아닌 spellID → drop", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { spellId: 99999 });
  assert.equal(parseLine(line), null);
});

test("한글 캐릭터명 처리", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { sourceName: "김태훈-아즈샤라", spellId: 97462, spellName: "Rallying Cry" });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.player, "김태훈");
});

test("realm 접미어 제거", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { sourceName: "Nira-Stormrage", spellId: 51052, spellName: "Anti-Magic Zone" });
  const ev = parseLine(line);
  assert.equal(ev.player, "Nira");
});

test("SPELL_AURA_APPLIED + BUFF + 추적 aura → aura 이벤트", () => {
  const line = buildLine("SPELL_AURA_APPLIED", {
    spellId: 47788,
    spellName: "Guardian Spirit",
    extra: "BUFF",
  });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "aura");
  assert.equal(ev.spellId, 47788);
  assert.equal(ev.class, "PRIEST");
});

test("SPELL_AURA_APPLIED + DEBUFF → drop", () => {
  const line = buildLine("SPELL_AURA_APPLIED", {
    spellId: 47788,
    spellName: "Guardian Spirit",
    extra: "DEBUFF",
  });
  assert.equal(parseLine(line), null);
});

test("SPELL_AURA_APPLIED + 추적 안 되는 auraID → drop", () => {
  const line = buildLine("SPELL_AURA_APPLIED", {
    spellId: 12345,
    spellName: "Unknown",
    extra: "BUFF",
  });
  assert.equal(parseLine(line), null);
});

// P0-2 회귀: SPELL_AURA_APPLIED에서 BUFF 뒤에 amount 필드가 추가되는 흡수 보호막류
test("SPELL_AURA_APPLIED + BUFF + amount(흡수 보호막) → 추적 통과", () => {
  // 흡수 보호막 Stitch 라인은 BUFF 뒤에 amount(흡수량)가 추가됨.
  // Guardian Spirit은 흡수 스킬이 아니지만 13필드 형태도 정상 인식해야 함.
  const line = buildLine("SPELL_AURA_APPLIED", {
    spellId: 47788,
    spellName: "Guardian Spirit",
    extra: "BUFF,1234567",
  });
  const ev = parseLine(line);
  assert.ok(ev, "auraType는 마지막 필드가 아니라 인덱스 11에서 읽어야 함");
  assert.equal(ev.type, "aura");
  assert.equal(ev.spellId, 47788);
});

// ===== RAID_CD (공대 쿨) =====

test("RAID_CD: Rallying Cry cast", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { spellId: 97462, spellName: "Rallying Cry" });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "cast");
  assert.equal(ev.class, "WARRIOR");
});

test("RAID_CD: Tranquility cast", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { spellId: 740, spellName: "Tranquility" });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.class, "DRUID");
});

test("RAID_CD: Darkness cast", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { spellId: 196718, spellName: "Darkness" });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.class, "DEMONHUNTER");
});

// ===== HEROISM (영웅심) =====

test("HEROISM: Heroism cast", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { spellId: 32182, spellName: "Heroism" });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.class, "SHAMAN");
});

test("HEROISM: Time Warp cast", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { spellId: 80353, spellName: "Time Warp" });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.class, "MAGE");
});

// ===== BATTLEREZ (전투 부활) =====

test("BATTLEREZ: Rebirth cast", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { spellId: 20484, spellName: "Rebirth" });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.class, "DRUID");
});

test("BATTLEREZ: Soulstone cast", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { spellId: 20707, spellName: "Soulstone" });
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.class, "WARLOCK");
});

// ===== SPELL_INTERRUPT: 데드 코드 제거됨 — 알 수 없는 이벤트로 드롭 =====

test("SPELL_INTERRUPT: 더 이상 추적 안 함 → drop", () => {
  const line = buildLine("SPELL_INTERRUPT", {
    spellId: 6552,
    spellName: "Pummel",
    extra: `54321,"Evil Cast",0x20`,
  });
  assert.equal(parseLine(line), null);
});

// ===== DEATH / ENCOUNTER / DAMAGE =====

test("UNIT_DIED on party member → death event", () => {
  const line = `4/11 20:13:42.123  UNIT_DIED,0000000000000000,nil,0x0,0x0,Player-1-0001,"Holy신부-Azshara",0x512,0x0`;
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "death");
  assert.equal(ev.player, "Holy신부");
});

test("UNIT_DIED on non-party (NPC) → drop", () => {
  const line = `4/11 20:13:42.123  UNIT_DIED,0000000000000000,nil,0x0,0x0,Creature-0,"Random Mob",0x10a48,0x0`;
  assert.equal(parseLine(line), null);
});

test("UNIT_DIED + WoW 11+ recapID 추가 필드 → 정상 처리", () => {
  // recapID는 끝에 추가되지만 우리는 dest 인덱스(4-7)만 읽으므로 영향 없음.
  const line = `4/11 20:13:42.123  UNIT_DIED,0000000000000000,nil,0x0,0x0,Player-1-0001,"Tank-Azshara",0x512,0x0,42`;
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.player, "Tank");
});

test("ENCOUNTER_START → encounter_start event", () => {
  const line = `4/11 20:13:42.123  ENCOUNTER_START,2741,"Broodtwister Ovi'nax",16,20,2657`;
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "encounter_start");
  assert.equal(ev.encounterId, 2741);
  assert.equal(ev.encounterName, "Broodtwister Ovi'nax");
});

test("ENCOUNTER_END success → encounter_end event", () => {
  const line = `4/11 20:13:42.123  ENCOUNTER_END,2741,"Broodtwister Ovi'nax",16,20,1,184500`;
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "encounter_end");
  assert.equal(ev.success, true);
});

test("SPELL_DAMAGE on party member (advanced logging) → damage event", () => {
  const advanced = "Creature-0-1234,0000000000000000,2000000,2000000,1000,1000,1000,1000,0,0,0,0,0,0,0.0,0.0,0";
  const line = `4/11 20:13:42.123  SPELL_DAMAGE,Creature-0-1234,"Raszageth",0x10a48,0x0,Player-1-0001,"Holy신부-Azshara",0x512,0x0,381466,"Lightning Breath",0x8,${advanced},2847193,2847193,0,1,0,nil,nil,nil`;
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "damage");
  assert.equal(ev.target, "Holy신부");
  assert.equal(ev.sourceName, "Raszageth");
  assert.equal(ev.spellName, "Lightning Breath");
  assert.equal(ev.amount, 2847193);
  assert.equal(ev.overkill, 0);
});

// P1-1 회귀: advanced logging이 OFF인 환경
test("SPELL_DAMAGE without advanced logging → 정상 amount 추출", () => {
  // advanced OFF: prefix(8) + spell(3) + amount, baseAmount, overkill, ...
  const line = `4/11 20:13:42.123  SPELL_DAMAGE,Creature-0-1234,"Raszageth",0x10a48,0x0,Player-1-0001,"Holy신부-Azshara",0x512,0x0,381466,"Lightning Breath",0x8,500000,500000,0,1,0,nil,nil,nil`;
  const ev = parseLine(line);
  assert.ok(ev, "advanced 미적용 라인도 처리되어야 함");
  assert.equal(ev.amount, 500000);
  assert.equal(ev.overkill, 0);
});

// P1-2 회귀: overkill 필드 추출
test("SPELL_DAMAGE with overkill > 0 → 킬링 블로우 표시 가능", () => {
  const advanced = "Creature-0-1234,0000000000000000,2000000,2000000,1000,1000,1000,1000,0,0,0,0,0,0,0.0,0.0,0";
  const line = `4/11 20:13:42.123  SPELL_DAMAGE,Creature-0-1234,"Raszageth",0x10a48,0x0,Player-1-0001,"Tank-Azshara",0x512,0x0,381466,"Lightning Breath",0x8,${advanced},5000000,3500000,1500000,1,0,nil,nil,nil`;
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.amount, 5000000);
  assert.equal(ev.overkill, 1500000);
});

test("SPELL_PERIODIC_DAMAGE → damage event with periodic flag", () => {
  const advanced = "Creature-0-1234,0000000000000000,2000000,2000000,1000,1000,1000,1000,0,0,0,0,0,0,0.0,0.0,0";
  const line = `4/11 20:13:42.123  SPELL_PERIODIC_DAMAGE,Creature-0-1234,"Raszageth",0x10a48,0x0,Player-1-0001,"Holy신부-Azshara",0x512,0x0,374087,"Static Charge",0x8,${advanced},120000,120000,0,1,0,nil,nil,nil`;
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "damage");
  assert.equal(ev.amount, 120000);
  assert.equal(ev.periodic, true);
});

test("SPELL_DAMAGE on NPC → drop", () => {
  const advanced = "Player-1-0001,0000000000000000,1000,1000,500,500,500,500,0,0,0,0,0,0,0.0,0.0,0";
  const line = `4/11 20:13:42.123  SPELL_DAMAGE,Player-1-0001,"Taehun-Azshara",0x511,0x0,Creature-0,"Boss",0x10a48,0x0,12345,"Spell",0x1,${advanced},5000,5000,0,1,0,nil,nil,nil`;
  assert.equal(parseLine(line), null);
});

test("SWING_DAMAGE on party member (advanced) → damage event", () => {
  // SWING_DAMAGE: prefix(8) + advanced(17) + amount, base, overkill, ...
  const advanced = "Creature-0-9999,0000000000000000,2000000,2000000,500,500,500,500,0,0,0,0,0,0,0.0,0.0,0";
  const line = `4/11 20:13:42.123  SWING_DAMAGE,Creature-0-9999,"Boss Add",0x10a48,0x0,Player-1-0001,"Tank-Azshara",0x512,0x0,${advanced},250000,250000,0,1,0,nil,nil,nil`;
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "damage");
  assert.equal(ev.spellName, "Melee");
  assert.equal(ev.amount, 250000);
});

test("SWING_DAMAGE without advanced logging → 정상 amount 추출", () => {
  const line = `4/11 20:13:42.123  SWING_DAMAGE,Creature-0-9999,"Boss Add",0x10a48,0x0,Player-1-0001,"Tank-Azshara",0x512,0x0,180000,180000,0,1,0,nil,nil,nil`;
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.amount, 180000);
});

// P1-4 회귀: ENVIRONMENTAL_DAMAGE
test("ENVIRONMENTAL_DAMAGE Falling on party member → damage event", () => {
  // ENVIRONMENTAL_DAMAGE,prefix(8),environmentalType,amount,base,overkill,...
  const line = `4/11 20:13:42.123  ENVIRONMENTAL_DAMAGE,0000000000000000,nil,0x0,0x0,Player-1-0001,"Squishy-Azshara",0x511,0x0,Falling,750000,750000,250000,1,0,nil,nil,nil`;
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "damage");
  assert.equal(ev.amount, 750000);
  assert.equal(ev.overkill, 250000);
  assert.equal(ev.sourceName, "Falling");
});

// P1-4 회귀: SPELL_INSTAKILL
test("SPELL_INSTAKILL on party member → damage event flagged as killing blow", () => {
  const line = `4/11 20:13:42.123  SPELL_INSTAKILL,Creature-0-1234,"Raszageth",0x10a48,0x0,Player-1-0001,"Slowpoke-Azshara",0x512,0x0,381466,"Wipe Mechanic",0x1`;
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "damage");
  assert.equal(ev.spellName, "Wipe Mechanic");
  assert.ok(ev.overkill > 0, "instakill은 overkill > 0이어야 킬링 블로우로 우선됨");
});

// P0-1 회귀: Windows CRLF 라인 종결자
test("Windows CRLF: SPELL_AURA_APPLIED 라인 끝에 \\r 가 있어도 정상 인식", () => {
  const line = buildLine("SPELL_AURA_APPLIED", {
    spellId: 47788,
    spellName: "Guardian Spirit",
    extra: "BUFF",
  }) + "\r";
  const ev = parseLine(line);
  assert.ok(ev, "라인 끝 \\r 때문에 BUFF 비교가 깨지지 않아야 함");
  assert.equal(ev.type, "aura");
});

test("Windows CRLF: SPELL_CAST_SUCCESS 라인 끝에 \\r 가 있어도 정상 인식", () => {
  const line = buildLine("SPELL_CAST_SUCCESS", { spellId: 33206, spellName: "Pain Suppression" }) + "\r";
  const ev = parseLine(line);
  assert.ok(ev);
  assert.equal(ev.type, "cast");
});

// ===== 기타 =====

test("빈 줄 / 깨진 라인 → drop", () => {
  assert.equal(parseLine(""), null);
  assert.equal(parseLine("garbage"), null);
  assert.equal(parseLine("4/11 20:13:42.123"), null);
  assert.equal(parseLine("\r"), null);
});
