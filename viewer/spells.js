// 추적 스펠 데이터 (WoW 12.0.1 기준)
// 스펠 추가/수정 시 PartyCD/SpellData.lua 와 양쪽 동시 수정 필요

export const SpellData = {
  // ===== 힐러 외부 생존기 =====
  47788:  { name: "Guardian Spirit",            class: "PRIEST",      category: "SURVIVAL",  cooldown: 180, auraSpellID: 47788 },
  33206:  { name: "Pain Suppression",           class: "PRIEST",      category: "SURVIVAL",  cooldown: 180, auraSpellID: 33206 },
  102342: { name: "Ironbark",                   class: "DRUID",       category: "SURVIVAL",  cooldown: 90,  auraSpellID: 102342 },
  6940:   { name: "Blessing of Sacrifice",      class: "PALADIN",     category: "SURVIVAL",  cooldown: 120, auraSpellID: 6940 },
  633:    { name: "Lay on Hands",               class: "PALADIN",     category: "SURVIVAL",  cooldown: 420 },
  116849: { name: "Life Cocoon",                class: "MONK",        category: "SURVIVAL",  cooldown: 120, auraSpellID: 116849 },
  98008:  { name: "Spirit Link Totem",          class: "SHAMAN",      category: "SURVIVAL",  cooldown: 180 },
  207399: { name: "Ancestral Protection Totem", class: "SHAMAN",      category: "SURVIVAL",  cooldown: 300 },
  363534: { name: "Rewind",                     class: "EVOKER",      category: "SURVIVAL",  cooldown: 240 },

  // ===== 공대 힐링 쿨 =====
  740:    { name: "Tranquility",         class: "DRUID",       category: "RAID_CD", cooldown: 180 },
  64843:  { name: "Divine Hymn",         class: "PRIEST",      category: "RAID_CD", cooldown: 180 },
  108280: { name: "Healing Tide Totem",  class: "SHAMAN",      category: "RAID_CD", cooldown: 180 },
  115310: { name: "Revival",            class: "MONK",        category: "RAID_CD", cooldown: 180 },

  // ===== 공대 방어 쿨 =====
  97462:  { name: "Rallying Cry",        class: "WARRIOR",     category: "RAID_CD", cooldown: 180 },
  196718: { name: "Darkness",            class: "DEMONHUNTER", category: "RAID_CD", cooldown: 300 },
  51052:  { name: "Anti-Magic Zone",     class: "DEATHKNIGHT", category: "RAID_CD", cooldown: 120 },
  31821:  { name: "Aura Mastery",        class: "PALADIN",     category: "RAID_CD", cooldown: 180 },

  // ===== 영웅심/블러드러스트 =====
  32182:  { name: "Heroism",             class: "SHAMAN",      category: "HEROISM", cooldown: 300 },
  2825:   { name: "Bloodlust",           class: "SHAMAN",      category: "HEROISM", cooldown: 300 },
  80353:  { name: "Time Warp",           class: "MAGE",        category: "HEROISM", cooldown: 300 },
  264667: { name: "Primal Rage",         class: "HUNTER",      category: "HEROISM", cooldown: 300 },
  390386: { name: "Fury of the Aspects", class: "EVOKER",      category: "HEROISM", cooldown: 300 },

  // ===== 전투 부활 =====
  20484:  { name: "Rebirth",             class: "DRUID",       category: "BATTLEREZ", cooldown: 600 },
  61999:  { name: "Raise Ally",          class: "DEATHKNIGHT", category: "BATTLEREZ", cooldown: 600 },
  20707:  { name: "Soulstone",           class: "WARLOCK",     category: "BATTLEREZ", cooldown: 600 },
  391054: { name: "Intercession",        class: "PALADIN",     category: "BATTLEREZ", cooldown: 600 },
};

// auraSpellID → 원본 spellID 역인덱스 (SPELL_AURA_APPLIED 감지용)
export const AuraToSpell = {};
for (const [id, data] of Object.entries(SpellData)) {
  if (data.auraSpellID) AuraToSpell[data.auraSpellID] = Number(id);
}

// 클래스 색 (RAID_CLASS_COLORS 기반)
export const CLASS_COLORS = {
  PRIEST:      "#FFFFFF",
  DRUID:       "#FF7C0A",
  PALADIN:     "#F48CBA",
  MONK:        "#00FF98",
  SHAMAN:      "#0070DD",
  EVOKER:      "#33937F",
  ROGUE:       "#FFF468",
  WARRIOR:     "#C69B6D",
  DEATHKNIGHT: "#C41E3A",
  HUNTER:      "#AAD372",
  DEMONHUNTER: "#A330C9",
  MAGE:        "#3FC7EB",
  WARLOCK:     "#8788EE",
};
