// 추적 스펠 데이터 (WoW 12.0.1 기준)
// iconName: Wowhead CDN 파일 이름 (https://wow.zamimg.com/images/wow/icons/large/{name}.jpg)
// abbr: 아이콘 로딩 실패 시 폴백용 2-3자 약어
// nameKo: WoW KR 클라이언트 공식 스펠명 (UI 한국어 토글 시 사용)

export const SpellData = {
  // ===== 힐러 외부 생존기 =====
  47788:  { name: "Guardian Spirit",            nameKo: "수호 영혼",         class: "PRIEST",      category: "SURVIVAL",  cooldown: 180, auraSpellID: 47788,  iconName: "spell_holy_guardianspirit",       abbr: "GS" },
  33206:  { name: "Pain Suppression",           nameKo: "고통 억제",         class: "PRIEST",      category: "SURVIVAL",  cooldown: 180, auraSpellID: 33206,  iconName: "spell_holy_painsupression",       abbr: "PS" },
  102342: { name: "Ironbark",                   nameKo: "무쇠 껍질",         class: "DRUID",       category: "SURVIVAL",  cooldown: 90,  auraSpellID: 102342, iconName: "spell_druid_ironbark",            abbr: "IB" },
  6940:   { name: "Blessing of Sacrifice",      nameKo: "희생의 축복",       class: "PALADIN",     category: "SURVIVAL",  cooldown: 120, auraSpellID: 6940,   iconName: "spell_holy_sealofsacrifice",      abbr: "BS" },
  633:    { name: "Lay on Hands",               nameKo: "신의 축복",         class: "PALADIN",     category: "SURVIVAL",  cooldown: 420,                      iconName: "spell_holy_layonhands",           abbr: "LH" },
  116849: { name: "Life Cocoon",                nameKo: "생명의 고치",       class: "MONK",        category: "SURVIVAL",  cooldown: 120, auraSpellID: 116849, iconName: "ability_monk_chicocoon",          abbr: "LC" },
  98008:  { name: "Spirit Link Totem",          nameKo: "정신 고리 토템",    class: "SHAMAN",      category: "SURVIVAL",  cooldown: 180,                      iconName: "spell_shaman_spiritlink",         abbr: "SL" },
  207399: { name: "Ancestral Protection Totem", nameKo: "조상의 보호 토템",  class: "SHAMAN",      category: "SURVIVAL",  cooldown: 300,                      iconName: "spell_nature_reincarnation",      abbr: "AP" },
  363534: { name: "Rewind",                     nameKo: "시간 되감기",       class: "EVOKER",      category: "SURVIVAL",  cooldown: 240,                      iconName: "ability_evoker_rewind",           abbr: "RW" },

  // ===== 공대 힐링 쿨 =====
  740:    { name: "Tranquility",         nameKo: "평온",            class: "DRUID",       category: "RAID_CD", cooldown: 180, iconName: "spell_nature_tranquility",     abbr: "TQ" },
  64843:  { name: "Divine Hymn",         nameKo: "신성한 찬가",     class: "PRIEST",      category: "RAID_CD", cooldown: 180, iconName: "spell_holy_divinehymn",        abbr: "DH" },
  108280: { name: "Healing Tide Totem",  nameKo: "치유의 해일 토템", class: "SHAMAN",     category: "RAID_CD", cooldown: 180, iconName: "ability_shaman_healingtide",   abbr: "HT" },
  115310: { name: "Revival",             nameKo: "소생",            class: "MONK",        category: "RAID_CD", cooldown: 180, iconName: "spell_monk_revival",           abbr: "RV" },

  // ===== 공대 방어 쿨 =====
  97462:  { name: "Rallying Cry",        nameKo: "재집결의 함성",   class: "WARRIOR",     category: "RAID_CD", cooldown: 180, iconName: "ability_warrior_rallyingcry",  abbr: "RC" },
  196718: { name: "Darkness",            nameKo: "어둠",            class: "DEMONHUNTER", category: "RAID_CD", cooldown: 300, iconName: "ability_demonhunter_darkness", abbr: "DK" },
  51052:  { name: "Anti-Magic Zone",     nameKo: "마법 차단 지대",  class: "DEATHKNIGHT", category: "RAID_CD", cooldown: 120, iconName: "spell_deathknight_antimagiczone", abbr: "AZ" },
  31821:  { name: "Aura Mastery",        nameKo: "오라 숙련",       class: "PALADIN",     category: "RAID_CD", cooldown: 180, iconName: "spell_holy_auramastery",       abbr: "AM" },

  // ===== 영웅심/블러드러스트 =====
  32182:  { name: "Heroism",             nameKo: "영웅심",          class: "SHAMAN",      category: "HEROISM", cooldown: 300, iconName: "ability_shaman_heroism",       abbr: "HE" },
  2825:   { name: "Bloodlust",           nameKo: "피의 욕망",       class: "SHAMAN",      category: "HEROISM", cooldown: 300, iconName: "spell_nature_bloodlust",       abbr: "BL" },
  80353:  { name: "Time Warp",           nameKo: "시간 왜곡",       class: "MAGE",        category: "HEROISM", cooldown: 300, iconName: "ability_mage_timewarp",        abbr: "TW" },
  264667: { name: "Primal Rage",         nameKo: "원시의 분노",     class: "HUNTER",      category: "HEROISM", cooldown: 300, iconName: "ability_hunter_primalrage",    abbr: "PR" },
  390386: { name: "Fury of the Aspects", nameKo: "위상의 분노",     class: "EVOKER",      category: "HEROISM", cooldown: 300, iconName: "inv_misc_head_dragon_red",     abbr: "FA" },

  // ===== 전투 부활 =====
  20484:  { name: "Rebirth",             nameKo: "환생",            class: "DRUID",       category: "BATTLEREZ", cooldown: 600, iconName: "spell_nature_reincarnation", abbr: "RB" },
  61999:  { name: "Raise Ally",          nameKo: "아군 일으키기",   class: "DEATHKNIGHT", category: "BATTLEREZ", cooldown: 600, iconName: "spell_shadow_deadofnight",   abbr: "RA" },
  20707:  { name: "Soulstone",           nameKo: "영혼석",          class: "WARLOCK",     category: "BATTLEREZ", cooldown: 600, iconName: "spell_shadow_soulgem",       abbr: "SS" },
  391054: { name: "Intercession",        nameKo: "중재",            class: "PALADIN",     category: "BATTLEREZ", cooldown: 600, iconName: "ability_paladin_intercession", abbr: "IC" },
};

// 현재 로케일에 맞는 스펠 표시명 반환. 한국어 + nameKo 존재 시 한국어, 아니면 영문 원어명.
export function localizedSpellName(spell, locale) {
  if (!spell) return "";
  if (locale === "ko" && spell.nameKo) return spell.nameKo;
  return spell.name;
}

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

// Wowhead 아이콘 CDN 베이스
export const ICON_CDN = "https://wow.zamimg.com/images/wow/icons/large";

export function iconUrl(iconName) {
  if (!iconName) return null;
  return `${ICON_CDN}/${iconName.toLowerCase()}.jpg`;
}
