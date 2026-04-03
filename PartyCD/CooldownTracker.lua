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
    RCT:RegisterEvent("UNIT_AURA", RCT.OnUnitAura)
    RCT:RegisterEvent("UNIT_SPELLCAST_INTERRUPTED", RCT.OnSpellcastInterrupted)
    RCT:Debug("Tracker: events registered (SPELLCAST/CD/AURA/INTERRUPT)")

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
-- 12.0.0+: UNIT_SPELLCAST_SUCCEEDED의 spellID는 Secret Values가 아님 (정상 정수)
-- pcall은 방어적 프로그래밍으로 유지 (향후 API 변경 대비)
function RCT:OnSpellcastSucceeded(unitTarget, castGUID, spellID, castBarID)
    -- 이벤트 자체가 발생하는지 확인용 디버그 (tracked spell만 출력)
    if RCT.SpellData[spellID] then
        RCT:Debug("EVENT UNIT_SPELLCAST_SUCCEEDED: unit=" .. tostring(unitTarget) .. " spellID=" .. tostring(spellID)
            .. " (" .. RCT.SpellData[spellID].name .. ")")
    end
    -- 본인 시전은 secret이 아님 → 안전하게 처리
    if UnitIsUnit(unitTarget, "player") then
        local spellData = RCT.SpellData[spellID]
        if not spellData then return end
        local playerName = UnitName("player")
        local key = playerName .. ":" .. spellID

        local now = GetTime()
        RCT.cooldowns[key] = {
            startTime = now,
            expires = now + spellData.cooldown,
            duration = spellData.cooldown,
            source = "local",
        }

        RCT:Debug("SPELLCAST_SELF: " .. spellData.name .. " cd=" .. spellData.cooldown .. "s")

        if RCT.OnCooldownUpdate then
            RCT:OnCooldownUpdate(playerName, spellID)
        end
        return
    end

    -- 다른 플레이어: pcall로 방어적 보호 유지
    local ok, spellData = pcall(function() return RCT.SpellData[spellID] end)
    if not ok or not spellData then return end

    local name = UnitName(unitTarget)
    if not name then return end
    name = Ambiguate(name, "short")

    if not RCT.roster[name] then
        RCT:Debug("SPELLCAST_OTHER: " .. name .. " NOT in roster, ignoring " .. spellData.name)
        return
    end

    local key = name .. ":" .. spellID

    local now = GetTime()
    RCT.cooldowns[key] = {
        startTime = now,
        expires = now + spellData.cooldown,
        duration = spellData.cooldown,
        source = "local",
    }

    RCT:Debug("SPELLCAST_OTHER: " .. name .. " used " .. spellData.name .. " cd=" .. spellData.cooldown .. "s")

    if RCT.OnCooldownUpdate then
        RCT:OnCooldownUpdate(name, spellID)
    end
end

-- UNIT_AURA: 생존기 버프 감지 (UNIT_SPELLCAST_SUCCEEDED의 보완 감지 수단)
-- 가시 범위 밖 힐러의 생존기 시전도 버프를 통해 감지 가능
function RCT:OnUnitAura(unitTarget, updateInfo)
    if not updateInfo or not updateInfo.addedAuras then return end
    if not (IsInGroup() or IsInRaid()) then return end

    for _, auraData in ipairs(updateInfo.addedAuras) do
        local auraSpellID = auraData.spellId
        if not auraSpellID then goto continue end

        local originalSpellID = RCT.AuraToSpell[auraSpellID]
        if not originalSpellID then goto continue end

        -- 시전자(sourceUnit) 확인
        local sourceUnit = auraData.sourceUnit
        if not sourceUnit then goto continue end

        local sourceName = UnitName(sourceUnit)
        if not sourceName then goto continue end
        sourceName = Ambiguate(sourceName, "short")

        -- 본인 시전은 다른 핸들러에서 처리
        if UnitIsUnit(sourceUnit, "player") then goto continue end

        -- 로스터에 있는 멤버인지 확인
        if not RCT.roster[sourceName] then goto continue end

        local key = sourceName .. ":" .. originalSpellID
        local existing = RCT.cooldowns[key]

        -- 이미 더 정확한 소스(addon/local)의 데이터가 있으면 덮어쓰지 않음
        if existing and existing.expires > GetTime() then goto continue end

        local spellData = RCT.SpellData[originalSpellID]
        if not spellData then goto continue end

        local now = GetTime()
        RCT.cooldowns[key] = {
            startTime = now,
            expires = now + spellData.cooldown,
            duration = spellData.cooldown,
            source = "aura",
        }

        RCT:Debug("AURA detected: " .. sourceName .. " used " .. spellData.name)

        if RCT.OnCooldownUpdate then
            RCT:OnCooldownUpdate(sourceName, originalSpellID)
        end

        ::continue::
    end
end

-- UNIT_SPELLCAST_INTERRUPTED: 차단 감지 보완
-- 12.0.0+ interruptedBy GUID로 누가 차단했는지 확인 가능
function RCT:OnSpellcastInterrupted(unitTarget, castGUID, spellID, interruptedBy, castBarID)
    if not interruptedBy then return end
    if not (IsInGroup() or IsInRaid()) then return end

    -- interruptedBy GUID를 파티/레이드 멤버와 매칭
    local interrupterName = nil
    for name, data in pairs(RCT.roster) do
        if data.unit and UnitGUID(data.unit) == interruptedBy then
            interrupterName = name
            break
        end
    end

    if not interrupterName then return end
    -- 본인은 다른 핸들러에서 처리
    if interrupterName == UnitName("player") then return end

    -- 해당 멤버의 차단기 스펠 찾기
    local member = RCT.roster[interrupterName]
    if not member then return end

    local classSpells = RCT.SpellsByClass[member.class]
    if not classSpells then return end

    for sid, sdata in pairs(classSpells) do
        if sdata.category == "INTERRUPT" then
            local key = interrupterName .. ":" .. sid
            local existing = RCT.cooldowns[key]

            -- 이미 최근 데이터가 있으면 스킵
            if existing and existing.expires > GetTime() then return end

            local now = GetTime()
            RCT.cooldowns[key] = {
                startTime = now,
                expires = now + sdata.cooldown,
                duration = sdata.cooldown,
                source = "interrupt",
            }

            RCT:Debug("INTERRUPT detected: " .. interrupterName .. " used " .. sdata.name)

            if RCT.OnCooldownUpdate then
                RCT:OnCooldownUpdate(interrupterName, sid)
            end
            return -- 클래스당 차단기는 보통 1개이므로 첫 매칭에서 중단
        end
    end
end

-- 본인 쿨타임 갱신 이벤트 (클래스 스킬만 순회)
function RCT:OnSpellUpdateCooldown()
    local playerName = UnitName("player")
    local _, classFile = UnitClass("player")
    local classSpells = RCT.SpellsByClass[classFile]
    if not classSpells then return end

    local updated = false
    for spellID, data in pairs(classSpells) do
        -- FIX-3: pcall로 전체 처리 블록 보호 (Secret Values 대응)
        pcall(function()
            local cdInfo = C_Spell.GetSpellCooldown(spellID)
            if cdInfo and cdInfo.startTime and cdInfo.duration
               and cdInfo.startTime > 0 and cdInfo.duration > 0 then
                if not cdInfo.isOnGCD then
                    local key = playerName .. ":" .. spellID
                    local existing = RCT.cooldowns[key]
                    -- 새 쿨다운이거나 startTime이 변경된 경우만 업데이트
                    if not existing or existing.startTime ~= cdInfo.startTime then
                        RCT.cooldowns[key] = {
                            startTime = cdInfo.startTime,
                            expires = cdInfo.startTime + cdInfo.duration,
                            duration = cdInfo.duration,
                            source = "self",
                        }
                        updated = true
                        RCT:Debug("SPELL_UPDATE_CD: " .. data.name .. " cd=" .. cdInfo.duration .. "s")
                    end
                end
            end
        end)
    end

    if updated and RCT.OnCooldownUpdate then
        RCT:OnCooldownUpdate(playerName, nil)
    end
end

-- 주기적 업데이트
local expiredKeys = {}
function RCT:OnTrackerUpdate()
    local now = GetTime()
    -- pairs() 순회 중 nil 할당은 정의되지 않은 동작이므로 별도 수집 후 제거
    wipe(expiredKeys)
    for key, data in pairs(RCT.cooldowns) do
        if data.expires <= now then
            expiredKeys[#expiredKeys + 1] = key
        end
    end
    for _, key in ipairs(expiredKeys) do
        RCT.cooldowns[key] = nil
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

