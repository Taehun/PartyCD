-- RosterManager.lua: 공대/파티 구성원 관리
local addonName, RCT = ...

-- 공대원 데이터 저장소
-- key = shortName (Ambiguate 처리됨), value = { unit, name, class, role, subgroup, online, hasAddon }
RCT.roster = {}
RCT.mySubgroup = 0

-- RT-2, RT-6: 이름 정규화 (크로스 렐름 대응)
local function NormalizeName(name)
    if not name then return nil end
    return Ambiguate(name, "short")
end

function RCT:InitRoster()
    RCT:RegisterEvent("GROUP_ROSTER_UPDATE", RCT.UpdateRoster)
    RCT:RegisterEvent("PLAYER_ENTERING_WORLD", function(self)
        -- FIX-1: ADDON_LOADED 시점에는 유닛 데이터 미준비, 지연 후 갱신
        C_Timer.After(1, function() RCT:UpdateRoster() end)
    end)
    -- FIX-1: 초기 UpdateRoster 제거 (ADDON_LOADED 시점에 유닛 데이터 없음)
    -- PLAYER_ENTERING_WORLD 또는 GROUP_ROSTER_UPDATE에서 처리
end

function RCT:UpdateRoster()
    -- hasAddon 상태 보존
    local prevAddonStatus = {}
    for name, data in pairs(RCT.roster) do
        if data.hasAddon then
            prevAddonStatus[name] = true
        end
    end

    wipe(RCT.roster)
    RCT.mySubgroup = 0

    if IsInRaid() then
        for i = 1, GetNumGroupMembers() do
            local unit = "raid" .. i
            RCT:AddUnitToRoster(unit, i)
            -- RT-2: UnitIsUnit으로 내 소그룹 확인 (크로스 렐름 안전)
            if UnitIsUnit(unit, "player") then
                local _, _, subgroup = GetRaidRosterInfo(i)
                RCT.mySubgroup = subgroup or 0
            end
        end
    elseif IsInGroup() then
        RCT:AddUnitToRoster("player", -1)
        for i = 1, GetNumGroupMembers() - 1 do
            local unit = "party" .. i
            RCT:AddUnitToRoster(unit, -1)
        end
        RCT.mySubgroup = 1
    end

    -- hasAddon 상태 복원
    for name, data in pairs(RCT.roster) do
        if prevAddonStatus[name] then
            data.hasAddon = true
        end
    end

    -- UI 갱신 트리거
    if RCT.OnRosterUpdate then
        RCT:OnRosterUpdate()
    end
end

function RCT:AddUnitToRoster(unit, raidIndex)
    if not UnitExists(unit) then return end

    local name = UnitName(unit)
    if not name then return end
    local shortName = NormalizeName(name)

    local _, classFile = UnitClass(unit)
    local role = UnitGroupRolesAssigned(unit)
    local subgroup = 0

    if raidIndex and raidIndex > 0 then
        local _, _, sg = GetRaidRosterInfo(raidIndex)
        subgroup = sg or 0
    elseif raidIndex and raidIndex == -1 then
        subgroup = 1
    end

    RCT.roster[shortName] = {
        unit = unit,
        name = shortName,
        class = classFile,
        role = role,
        subgroup = subgroup,
        online = UnitIsConnected(unit),
        hasAddon = false,
    }
end

-- 힐러 목록 반환
function RCT:GetHealers()
    local healers = {}
    for name, data in pairs(RCT.roster) do
        if data.role == "HEALER" and data.online then
            healers[name] = data
        end
    end
    return healers
end

-- 같은 파티 소그룹의 딜러 목록 반환
function RCT:GetPartyInterrupters()
    local interrupters = {}
    for name, data in pairs(RCT.roster) do
        if data.subgroup == RCT.mySubgroup and data.online then
            if data.role ~= "HEALER" then
                interrupters[name] = data
            end
        end
    end
    return interrupters
end

-- 이름으로 공대원 정보 조회
function RCT:GetMemberInfo(name)
    return RCT.roster[NormalizeName(name)]
end

-- 유닛의 추적 대상 스킬 목록 반환
function RCT:GetTrackedSpellsForUnit(name)
    local member = RCT.roster[name]
    if not member then return {} end

    local classSpells = RCT.SpellsByClass[member.class]
    if not classSpells then return {} end

    local result = {}
    for spellID, data in pairs(classSpells) do
        if member.role == "HEALER" and data.category == "SURVIVAL" then
            result[spellID] = data
        elseif member.role ~= "HEALER" and data.category == "INTERRUPT" then
            result[spellID] = data
        end
    end
    return result
end
