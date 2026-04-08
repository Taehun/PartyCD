-- AddonComm.lua: 파티원 간 쿨타임 동기화
-- 각 플레이어가 자신의 쿨다운을 broadcast → 파티원이 수신
local addonName, RCT = ...

local ADDON_PREFIX = "PCD"
local THROTTLE_INTERVAL = 0.5
local lastSent = {} -- key = spellID, value = GetTime()

-- 채널 결정: 인스턴스면 INSTANCE_CHAT, 아니면 RAID/PARTY
local function GetCommChannel()
    if IsInGroup(LE_PARTY_CATEGORY_INSTANCE) then
        return "INSTANCE_CHAT"
    elseif IsInRaid() then
        return "RAID"
    elseif IsInGroup() then
        return "PARTY"
    end
    return nil
end

function RCT:InitComm()
    local ok = pcall(C_ChatInfo.RegisterAddonMessagePrefix, ADDON_PREFIX)
    if not ok then
        RCT:Debug("AddonComm: prefix registration failed")
        return
    end

    RCT:RegisterEvent("CHAT_MSG_ADDON", RCT.OnAddonMessage)
    RCT:Debug("AddonComm: initialized, prefix=" .. ADDON_PREFIX)
end

-- WoW 12.0: M+ 키/보스전 중 addon comm 차단 여부 확인
local function IsCommLocked()
    if C_ChatInfo and C_ChatInfo.InChatMessagingLockdown then
        local ok, restricted = pcall(C_ChatInfo.InChatMessagingLockdown)
        if ok and restricted then return true end
    end
    return false
end

-- 본인 쿨다운 broadcast (풀 사이에만 전송 가능)
function RCT:BroadcastCooldown(spellID, duration)
    if IsCommLocked() then return end

    local channel = GetCommChannel()
    if not channel then return end

    -- 쓰로틀: 같은 스펠 0.5초 내 재전송 방지
    local now = GetTime()
    if lastSent[spellID] and (now - lastSent[spellID]) < THROTTLE_INTERVAL then
        return
    end
    lastSent[spellID] = now

    local msg = "CD:" .. spellID .. ":" .. duration
    local ok = pcall(C_ChatInfo.SendAddonMessage, ADDON_PREFIX, msg, channel)
    if ok then
        RCT:Debug("COMM_SEND: " .. msg .. " via " .. channel)
    end
end

-- 수신 처리
function RCT:OnAddonMessage(prefix, message, distribution, sender)
    if prefix ~= ADDON_PREFIX then return end

    -- 본인 메시지 무시
    local myName = UnitName("player")
    if not myName then return end
    local senderShort = Ambiguate(sender, "short")
    if senderShort == Ambiguate(myName, "short") then return end

    -- 메시지 파싱: "CD:spellID:duration"
    local msgType, spellIDStr, durationStr = strsplit(":", message)
    if msgType ~= "CD" then return end

    local spellID = tonumber(spellIDStr)
    local duration = tonumber(durationStr)
    if not spellID or not duration then return end

    -- 추적 대상 스펠인지 확인
    local spellData = RCT.SpellData[spellID]
    if not spellData then return end

    -- roster에 있는 멤버인지 확인
    if not RCT.roster[senderShort] then return end

    local key = senderShort .. ":" .. spellID
    local existing = RCT.cooldowns[key]

    -- 이미 유효한 데이터가 있으면 덮어쓰지 않음 (local/aura 우선)
    if existing and existing.expires > GetTime() and existing.source ~= "comm" then
        return
    end

    local now = GetTime()
    RCT.cooldowns[key] = {
        startTime = now,
        expires = now + duration,
        duration = duration,
        source = "comm",
    }

    RCT:Debug("COMM_RECV: " .. senderShort .. " used " .. spellData.name .. " cd=" .. duration .. "s")

    if RCT.OnCooldownUpdate then
        RCT:OnCooldownUpdate(senderShort, spellID)
    end
end

-- 파일 로딩 완료 마커
RCT._commLoaded = true
