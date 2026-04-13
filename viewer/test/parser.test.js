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

// ===== SPELL_INTERRUPT: 이제 SpellData에 해당 spellId 없으므로 drop =====

test("SPELL_INTERRUPT: 인터럽트 스펠이 SpellData에 없으므로 drop", () => {
  const line = buildLine("SPELL_INTERRUPT", {
    spellId: 6552,
    spellName: "Pummel",
    extra: `54321,"Evil Cast",0x20`,
  });
  assert.equal(parseLine(line), null);
});

// ===== 기타 =====

test("관심 없는 이벤트 → drop", () => {
  const line = buildLine("SPELL_DAMAGE", { spellId: 97462 });
  assert.equal(parseLine(line), null);
});

test("빈 줄 / 깨진 라인 → drop", () => {
  assert.equal(parseLine(""), null);
  assert.equal(parseLine("garbage"), null);
  assert.equal(parseLine("4/11 20:13:42.123"), null);
});
