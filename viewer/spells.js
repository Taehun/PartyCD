// SpellData.lua 포트 (WoW 12.0.1 기준)
// 스펠 추가/수정 시 PartyCD/SpellData.lua 와 양쪽 동시 수정 필요

export const SpellData = {
  // ===== 힐러 생존기 =====
  47788:  { name: "Guardian Spirit",            class: "PRIEST",      category: "SURVIVAL",  cooldown: 180, auraSpellID: 47788 },
  33206:  { name: "Pain Suppression",           class: "PRIEST",      category: "SURVIVAL",  cooldown: 180, auraSpellID: 33206 },
  102342: { name: "Ironbark",                   class: "DRUID",       category: "SURVIVAL",  cooldown: 90,  auraSpellID: 102342 },
  6940:   { name: "Blessing of Sacrifice",      class: "PALADIN",     category: "SURVIVAL",  cooldown: 120, auraSpellID: 6940 },
  633:    { name: "Lay on Hands",               class: "PALADIN",     category: "SURVIVAL",  cooldown: 420 },
  116849: { name: "Life Cocoon",                class: "MONK",        category: "SURVIVAL",  cooldown: 120, auraSpellID: 116849 },
  98008:  { name: "Spirit Link Totem",          class: "SHAMAN",      category: "SURVIVAL",  cooldown: 180 },
  207399: { name: "Ancestral Protection Totem", class: "SHAMAN",      category: "SURVIVAL",  cooldown: 300 },
  363534: { name: "Rewind",                     class: "EVOKER",      category: "SURVIVAL",  cooldown: 240 },

  // ===== 딜러/탱커 차단기 =====
  1766:   { name: "Kick",               class: "ROGUE",       category: "INTERRUPT", cooldown: 15 },
  6552:   { name: "Pummel",             class: "WARRIOR",     category: "INTERRUPT", cooldown: 15 },
  47528:  { name: "Mind Freeze",        class: "DEATHKNIGHT", category: "INTERRUPT", cooldown: 15 },
  147362: { name: "Counter Shot",       class: "HUNTER",      category: "INTERRUPT", cooldown: 24 },
  116705: { name: "Spear Hand Strike",  class: "MONK",        category: "INTERRUPT", cooldown: 15 },
  183752: { name: "Disrupt",            class: "DEMONHUNTER", category: "INTERRUPT", cooldown: 15 },
  57994:  { name: "Wind Shear",         class: "SHAMAN",      category: "INTERRUPT", cooldown: 15 },
  2139:   { name: "Counterspell",      class: "MAGE",        category: "INTERRUPT", cooldown: 25 },
  351338: { name: "Quell",              class: "EVOKER",      category: "INTERRUPT", cooldown: 20 },
  106839: { name: "Skull Bash",         class: "DRUID",       category: "INTERRUPT", cooldown: 15 },
  96231:  { name: "Rebuke",             class: "PALADIN",     category: "INTERRUPT", cooldown: 15 },
  15487:  { name: "Silence",            class: "PRIEST",      category: "INTERRUPT", cooldown: 45 },
  187707: { name: "Muzzle",             class: "HUNTER",      category: "INTERRUPT", cooldown: 15 },
  78675:  { name: "Solar Beam",         class: "DRUID",       category: "INTERRUPT", cooldown: 60 },
};

// auraSpellID → 원본 spellID 역인덱스 (UNIT_AURA 대응 SPELL_AURA_APPLIED 감지용)
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
};
