-- CooldownTracker.lua: 쿨타임 추적 로직
local addonName, RCT = ...

-- 쿨타임 데이터 저장소
-- key = "playerName:spellID", value = { expires, duration, source }
RCT.cooldowns = {}

-- 업데이트 주기 (초)
local UPDATE_INTERVAL = 0.1
local elapsed = 0

-- RT-4: OnUpdate 프레임을 모듈 레벨에서 관리
local updater

function RCT:InitTracker()
    RCT:RegisterEvent("UNIT_SPELLCAST_SUCCEEDED", RCT.OnSpellcastSucceeded)
    RCT:RegisterEvent("SPELL_UPDATE_COOLDOWN", RCT.OnSpellUpdateCooldown)

    -- RT-4: OnUpdate 프레임 생성 (초기에는 숨김)
    updater = CreateFrame("Frame")
    updater:SetScript("OnUpdate", function(self, dt)
        elapsed = elapsed + dt
        if elapsed >= UPDATE_INTERVAL then
            elapsed = 0
            RCT:OnTrackerUpdate()
        end
    end)
    updater:Hide() -- 그룹 없으면 비활성화

    -- RT-4: 그룹 상태에 따라 OnUpdate 활성화/비활성화
    RCT:RegisterEvent("GROUP_ROSTER_UPDATE", function()
        if IsInGroup() or IsInRaid() then
            updater:Show()
        else
            updater:Hide()
            wipe(RCT.cooldowns)
        end
    end)

    -- 이미 그룹에 있으면 활성화
    if IsInGroup() or IsInRaid() then
        updater:Show()
    end
end

-- 다른 플레이어가 스킬 시전 시 (로컬 감지)
-- 12.0.0 Secret Values: 보스전/M+/PvP 중 다른 플레이어의 spellID가
-- secret value로 변환되어 비교/인덱싱 시 Lua 에러 발생 가능
-- → pcall로 보호하여 에러 방지, 이 경우 애드온 통신으로 대체됨
function RCT:OnSpellcastSucceeded(unitTarget, castGUID, spellID)
    -- 본인 시전은 secret이 아님 → 안전하게 처리
    if UnitIsUnit(unitTarget, "player") then
        local spellData = RCT.SpellData[spellID]
        if not spellData then return end
        local playerName = UnitName("player")
        local key = playerName .. ":" .. spellID

        RCT.cooldowns[key] = {
            expires = GetTime() + spellData.cooldown,
            duration = spellData.cooldown,
            source = "local",
        }

        if RCT.OnCooldownUpdate then
            RCT:OnCooldownUpdate(playerName, spellID)
        end

        C_Timer.After(0.2, function()
            RCT:BroadcastMyCooldown(spellID)
        end)
        return
    end

    -- 다른 플레이어: spellID가 secret value일 수 있으므로 pcall 보호
    local ok, spellData = pcall(function() return RCT.SpellData[spellID] end)
    if not ok or not spellData then return end

    local name = UnitName(unitTarget)
    if not name then return end
    name = Ambiguate(name, "short")

    if not RCT.roster[name] then return end

    local key = name .. ":" .. spellID
    local existing = RCT.cooldowns[key]

    -- 애드온 통신으로 받은 데이터가 있으면 덮어쓰지 않음 (더 정확)
    if existing and existing.source == "addon" and existing.expires > GetTime() then
        return
    end

    RCT.cooldowns[key] = {
        expires = GetTime() + spellData.cooldown,
        duration = spellData.cooldown,
        source = "local",
    }

    if RCT.OnCooldownUpdate then
        RCT:OnCooldownUpdate(name, spellID)
    end
end

-- 본인 쿨타임 갱신 이벤트 (클래스 스킬만 순회)
function RCT:OnSpellUpdateCooldown()
    local playerName = UnitName("player")
    local _, classFile = UnitClass("player")
    local classSpells = RCT.SpellsByClass[classFile]
    if not classSpells then return end

    for spellID, data in pairs(classSpells) do
        local cdInfo = C_Spell.GetSpellCooldown(spellID)
        if cdInfo and cdInfo.startTime and cdInfo.startTime > 0 then
            -- 12.0.0+ isOnGCD 필드로 GCD 정확히 필터링
            if not cdInfo.isOnGCD then
                local key = playerName .. ":" .. spellID
                RCT.cooldowns[key] = {
                    expires = cdInfo.startTime + cdInfo.duration,
                    duration = cdInfo.duration,
                    source = "self",
                }
            end
        end
    end
end

-- 애드온 통신으로 받은 쿨타임 데이터 적용
function RCT:ApplyAddonCooldown(senderName, spellID, remaining, totalCD)
    local key = senderName .. ":" .. spellID

    RCT.cooldowns[key] = {
        expires = GetTime() + remaining,
        duration = totalCD,
        source = "addon",
    }

    if RCT.roster[senderName] then
        RCT.roster[senderName].hasAddon = true
    end

    if RCT.OnCooldownUpdate then
        RCT:OnCooldownUpdate(senderName, spellID)
    end
end

-- 주기적 업데이트
function RCT:OnTrackerUpdate()
    local now = GetTime()
    for key, data in pairs(RCT.cooldowns) do
        if data.expires <= now then
            RCT.cooldowns[key] = nil
        end
    end

    if RCT.OnFrameUpdate then
        RCT:OnFrameUpdate()
    end
end

-- 특정 플레이어+스킬의 남은 쿨타임 조회
function RCT:GetCooldownRemaining(playerName, spellID)
    local key = playerName .. ":" .. spellID
    local data = RCT.cooldowns[key]
    if not data then return 0, 0 end

    local remaining = data.expires - GetTime()
    if remaining <= 0 then return 0, 0 end

    return remaining, data.duration
end

-- 본인 쿨타임 브로드캐스트
function RCT:BroadcastMyCooldown(spellID)
    if not RCT.SendCooldownMessage then return end

    local cdInfo = C_Spell.GetSpellCooldown(spellID)
    if cdInfo and cdInfo.startTime and cdInfo.startTime > 0 and not cdInfo.isOnGCD then
        local remaining = (cdInfo.startTime + cdInfo.duration) - GetTime()
        if remaining > 0 then
            RCT:SendCooldownMessage(spellID, remaining, cdInfo.duration)
        end
    end
end
