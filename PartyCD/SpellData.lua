-- SpellData.lua: 추적 대상 스킬 정의
local addonName, RCT = ...

-- 스킬 데이터 테이블
-- key = spellID, value = { name, class, category, cooldown(초) }
-- Wowhead 기준 검증 완료 (12.0.1)
RCT.SpellData = {
    -- ===== 힐러 생존기 =====

    -- 사제 (Priest)
    [47788]  = { name = "Guardian Spirit",           class = "PRIEST",       category = "SURVIVAL",  cooldown = 180 },
    [33206]  = { name = "Pain Suppression",          class = "PRIEST",       category = "SURVIVAL",  cooldown = 180 },

    -- 드루이드 (Druid)
    [102342] = { name = "Ironbark",                  class = "DRUID",        category = "SURVIVAL",  cooldown = 90 },

    -- 성기사 (Paladin)
    [6940]   = { name = "Blessing of Sacrifice",     class = "PALADIN",      category = "SURVIVAL",  cooldown = 120 },
    [633]    = { name = "Lay on Hands",              class = "PALADIN",      category = "SURVIVAL",  cooldown = 420 },

    -- 수도사 (Monk)
    [116849] = { name = "Life Cocoon",               class = "MONK",         category = "SURVIVAL",  cooldown = 120 },

    -- 주술사 (Shaman)
    [98008]  = { name = "Spirit Link Totem",         class = "SHAMAN",       category = "SURVIVAL",  cooldown = 180 },
    [207399] = { name = "Ancestral Protection Totem",class = "SHAMAN",       category = "SURVIVAL",  cooldown = 300 },

    -- 기원사 (Evoker)
    [363534] = { name = "Rewind",                    class = "EVOKER",       category = "SURVIVAL",  cooldown = 240 },

    -- ===== 딜러/탱커 차단기 =====

    -- 도적 (Rogue)
    [1766]   = { name = "Kick",                      class = "ROGUE",        category = "INTERRUPT", cooldown = 15 },

    -- 전사 (Warrior)
    [6552]   = { name = "Pummel",                    class = "WARRIOR",      category = "INTERRUPT", cooldown = 15 },

    -- 죽음의 기사 (Death Knight)
    [47528]  = { name = "Mind Freeze",               class = "DEATHKNIGHT",  category = "INTERRUPT", cooldown = 15 },

    -- 사냥꾼 (Hunter)
    [147362] = { name = "Counter Shot",              class = "HUNTER",       category = "INTERRUPT", cooldown = 24 },

    -- 수도사 (Monk)
    [116705] = { name = "Spear Hand Strike",         class = "MONK",         category = "INTERRUPT", cooldown = 15 },

    -- 악마사냥꾼 (Demon Hunter)
    [183752] = { name = "Disrupt",                   class = "DEMONHUNTER",  category = "INTERRUPT", cooldown = 15 },

    -- 주술사 (Shaman)
    [57994]  = { name = "Wind Shear",                class = "SHAMAN",       category = "INTERRUPT", cooldown = 15 },

    -- 마법사 (Mage)
    [2139]   = { name = "Counterspell",              class = "MAGE",         category = "INTERRUPT", cooldown = 25 },

    -- 기원사 (Evoker)
    [351338] = { name = "Quell",                     class = "EVOKER",       category = "INTERRUPT", cooldown = 20 },

    -- 드루이드 (Druid)
    [106839] = { name = "Skull Bash",                class = "DRUID",        category = "INTERRUPT", cooldown = 15 },

    -- 성기사 (Paladin)
    [96231]  = { name = "Rebuke",                    class = "PALADIN",      category = "INTERRUPT", cooldown = 15 },

    -- 흑마법사 (Warlock)
    [19647]  = { name = "Spell Lock",                class = "WARLOCK",      category = "INTERRUPT", cooldown = 24 },
    [89766]  = { name = "Axe Toss",                  class = "WARLOCK",      category = "INTERRUPT", cooldown = 30 },
}

-- spellID로 빠르게 카테고리별 조회를 위한 역인덱스
RCT.SurvivalSpells = {}
RCT.InterruptSpells = {}

for spellID, data in pairs(RCT.SpellData) do
    if data.category == "SURVIVAL" then
        RCT.SurvivalSpells[spellID] = data
    elseif data.category == "INTERRUPT" then
        RCT.InterruptSpells[spellID] = data
    end
end

-- 클래스별 추적 스킬 인덱스
RCT.SpellsByClass = {}
for spellID, data in pairs(RCT.SpellData) do
    if not RCT.SpellsByClass[data.class] then
        RCT.SpellsByClass[data.class] = {}
    end
    RCT.SpellsByClass[data.class][spellID] = data
end
