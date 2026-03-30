-- AddonComm.lua: 애드온 간 쿨타임 데이터 통신
local addonName, RCT = ...

local ADDON_PREFIX = "PCD"
local MSG_COOLDOWN = "CD"
local MSG_SYNC = "SYNC"
local MSG_HELLO = "HI"

-- spellID별 throttle
local lastSendTimes = {}
local MIN_SEND_INTERVAL = 0.5

function RCT:InitComm()
    C_ChatInfo.RegisterAddonMessagePrefix(ADDON_PREFIX)
    RCT:RegisterEvent("CHAT_MSG_ADDON", RCT.OnAddonMessage)

    -- RT-3: 그룹 합류 시 Hello + Sync
    RCT:RegisterEvent("GROUP_JOINED", function()
        C_Timer.After(2, function()
            RCT:SendHello()
            C_Timer.After(1, function() RCT:RequestSync() end)
        end)
    end)

    -- RT-3: 이미 그룹에 있는 상태로 로그인/리로드 시에도 Hello + Sync
    RCT:RegisterEvent("PLAYER_ENTERING_WORLD", function()
        C_Timer.After(3, function()
            if IsInGroup() or IsInRaid() then
                RCT:SendHello()
                C_Timer.After(1, function() RCT:RequestSync() end)
            end
        end)
    end)
end

-- FIX-5: 메시지 전송 채널 결정 (INSTANCE_CHAT 지원)
local function GetChannel()
    if IsInRaid(LE_PARTY_CATEGORY_INSTANCE) then
        return "INSTANCE_CHAT"
    elseif IsInRaid() then
        return "RAID"
    elseif IsInGroup(LE_PARTY_CATEGORY_INSTANCE) then
        return "INSTANCE_CHAT"
    elseif IsInGroup() then
        return "PARTY"
    end
    return nil
end

-- 쿨타임 메시지 전송
function RCT:SendCooldownMessage(spellID, remaining, totalCD)
    local channel = GetChannel()
    if not channel then return end

    local now = GetTime()
    if lastSendTimes[spellID] and (now - lastSendTimes[spellID] < MIN_SEND_INTERVAL) then return end
    lastSendTimes[spellID] = now

    local msg = string.format("%s:%d:%.1f:%.1f", MSG_COOLDOWN, spellID, remaining, totalCD)
    -- 인스턴스 내 애드온 통신 차단 시 오류 방지
    pcall(C_ChatInfo.SendAddonMessage, ADDON_PREFIX, msg, channel)
end

-- 동기화 요청
function RCT:RequestSync()
    local channel = GetChannel()
    if not channel then return end
    pcall(C_ChatInfo.SendAddonMessage, ADDON_PREFIX, MSG_SYNC, channel)
end

-- Hello 메시지
function RCT:SendHello()
    local channel = GetChannel()
    if not channel then return end
    pcall(C_ChatInfo.SendAddonMessage, ADDON_PREFIX, MSG_HELLO .. ":" .. RCT.version, channel)
end

-- 수신 메시지 처리
function RCT:OnAddonMessage(prefix, message, distribution, sender)
    if prefix ~= ADDON_PREFIX then return end

    -- RT-6: Ambiguate로 이름 정규화 (크로스 렐름 대응)
    local senderName = Ambiguate(sender, "short")

    -- 본인 메시지 무시
    local playerName = UnitName("player")
    if senderName == playerName then return end

    local msgType, rest = message:match("^(%a+):?(.*)")
    if not msgType then return end

    if msgType == MSG_COOLDOWN then
        RCT:HandleCooldownMessage(senderName, rest)
    elseif msgType == MSG_SYNC then
        RCT:HandleSyncRequest(senderName)
    elseif msgType == MSG_HELLO then
        RCT:HandleHello(senderName, rest)
    end
end

-- 쿨타임 메시지 수신 처리
function RCT:HandleCooldownMessage(senderName, data)
    local spellIDStr, remainingStr, totalCDStr = data:match("^(%d+):([%d%.]+):([%d%.]+)")
    if not spellIDStr then return end

    local spellID = tonumber(spellIDStr)
    local remaining = tonumber(remainingStr)
    local totalCD = tonumber(totalCDStr)

    if not spellID or not remaining or not totalCD then return end
    if not RCT.SpellData[spellID] then return end

    RCT:ApplyAddonCooldown(senderName, spellID, remaining, totalCD)
end

-- 동기화 요청 수신: 현재 내 쿨타임 전부 전송
function RCT:HandleSyncRequest(senderName)
    local _, classFile = UnitClass("player")
    local classSpells = RCT.SpellsByClass[classFile]
    if not classSpells then return end

    local delay = 0
    for spellID, data in pairs(classSpells) do
        delay = delay + 0.3
        local sid = spellID
        C_Timer.After(delay, function()
            pcall(function()
                local cdInfo = C_Spell.GetSpellCooldown(sid)
                if cdInfo and cdInfo.startTime and cdInfo.duration
                   and cdInfo.startTime > 0 and not cdInfo.isOnGCD then
                    local remaining = (cdInfo.startTime + cdInfo.duration) - GetTime()
                    if remaining > 0 then
                        RCT:SendCooldownMessage(sid, remaining, cdInfo.duration)
                    end
                end
            end)
        end)
    end
end

-- Hello 수신
function RCT:HandleHello(senderName, versionStr)
    if RCT.roster[senderName] then
        RCT.roster[senderName].hasAddon = true
    end
end
