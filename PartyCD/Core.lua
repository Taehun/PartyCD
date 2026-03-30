-- Core.lua: 애드온 초기화 및 이벤트 프레임
local addonName, RCT = ...

RCT.version = "1.0.0"
RCT.addonPrefix = "PCD"
RCT.debug = false

-- 메인 이벤트 프레임
local frame = CreateFrame("Frame", "PartyCDFrame", UIParent)

-- 기본 설정
local defaults = {
    showSurvival = true,
    showInterrupt = true,
    locked = false,
    scale = 1.0,
    survivalPoint = { point = "TOPLEFT", relPoint = "TOPLEFT", x = 20, y = -200 },
    interruptPoint = { point = "TOPLEFT", relPoint = "TOPLEFT", x = 20, y = -400 },
}

-- 이벤트 핸들러를 배열로 관리하여 복수 등록 지원
local eventHandlers = {}

function RCT:RegisterEvent(event, handler)
    if not eventHandlers[event] then
        eventHandlers[event] = {}
        frame:RegisterEvent(event)
    end
    table.insert(eventHandlers[event], handler)
end

function RCT:UnregisterEvent(event)
    eventHandlers[event] = nil
    frame:UnregisterEvent(event)
end

frame:SetScript("OnEvent", function(self, event, ...)
    local handlers = eventHandlers[event]
    if handlers then
        for _, handler in ipairs(handlers) do
            handler(RCT, ...)
        end
    end
end)

-- FIX-2: 디버그 출력
function RCT:Debug(msg)
    if RCT.debug then
        print("|cff888888[PCD Debug]|r " .. tostring(msg))
    end
end

-- FIX-4: 안전한 모듈 초기화 (pcall 보호)
local function SafeInit(name, func)
    local ok, err = pcall(func)
    if not ok then
        print("|cffff0000[PartyCD]|r " .. name .. " 초기화 실패: " .. tostring(err))
    else
        RCT:Debug(name .. " 초기화 완료")
    end
end

-- 초기화
function RCT:Init()
    -- SavedVariables 로드
    if not PartyCDDB then
        PartyCDDB = {}
    end
    for k, v in pairs(defaults) do
        if PartyCDDB[k] == nil then
            if type(v) == "table" then
                PartyCDDB[k] = {}
                for kk, vv in pairs(v) do
                    PartyCDDB[k][kk] = vv
                end
            else
                PartyCDDB[k] = v
            end
        end
    end
    RCT.db = PartyCDDB

    -- FIX-4: 각 모듈을 pcall로 보호하여 하나 실패해도 나머지 실행
    SafeInit("Roster", function() RCT:InitRoster() end)
    SafeInit("Tracker", function() RCT:InitTracker() end)
    SafeInit("Comm", function() RCT:InitComm() end)
    SafeInit("UI", function() RCT:InitUI() end)

    -- 슬래시 커맨드
    SLASH_PCD1 = "/pcd"
    SlashCmdList["PCD"] = function(msg)
        RCT:HandleSlashCommand(msg)
    end

    local L = RCT.L
    print(string.format(L.ADDON_LOADED, RCT.version))

    -- FIX: 이미 그룹에 있는 상태에서 로드 시 지연 초기화
    C_Timer.After(2, function()
        if (IsInGroup() or IsInRaid()) and RCT.UpdateRoster then
            RCT:UpdateRoster()
        end
    end)
end

-- 슬래시 커맨드 처리
function RCT:HandleSlashCommand(msg)
    local L = RCT.L
    msg = msg and msg:lower():trim() or ""
    if msg == "lock" then
        RCT.db.locked = not RCT.db.locked
        RCT:UpdateFrameLock()
        print(RCT.db.locked and L.FRAME_LOCKED or L.FRAME_UNLOCKED)
    elseif msg == "reset" then
        RCT:ResetPositions()
        print(L.POSITION_RESET)
    elseif msg == "survival" then
        RCT.db.showSurvival = not RCT.db.showSurvival
        RCT:UpdateVisibility()
        print(RCT.db.showSurvival and L.SURVIVAL_ON or L.SURVIVAL_OFF)
    elseif msg == "interrupt" then
        RCT.db.showInterrupt = not RCT.db.showInterrupt
        RCT:UpdateVisibility()
        print(RCT.db.showInterrupt and L.INTERRUPT_ON or L.INTERRUPT_OFF)
    -- FIX-2: 디버그 모드
    elseif msg == "debug" then
        RCT.debug = not RCT.debug
        print("|cff00ff00[PartyCD]|r Debug: " .. (RCT.debug and "ON" or "OFF"))
        if RCT.debug then
            print("  roster count: " .. (RCT.roster and #RCT.roster or "nil"))
            local count = 0
            if RCT.roster then
                for _ in pairs(RCT.roster) do count = count + 1 end
            end
            print("  roster members: " .. count)
            print("  mySubgroup: " .. tostring(RCT.mySubgroup))
            print("  IsInGroup: " .. tostring(IsInGroup()))
            print("  IsInRaid: " .. tostring(IsInRaid()))
            print("  GetNumGroupMembers: " .. tostring(GetNumGroupMembers()))
            -- 강제 UI 갱신
            if RCT.UpdateRoster then RCT:UpdateRoster() end
            if RCT.RefreshUI then RCT:RefreshUI() end
        end
    else
        print(L.CMD_HELP_HEADER)
        print(L.CMD_LOCK)
        print(L.CMD_RESET)
        print(L.CMD_SURVIVAL)
        print(L.CMD_INTERRUPT)
        print("  /pcd debug - Toggle debug mode")
    end
end

-- SetPoint 헬퍼 (key-value 테이블 → SetPoint 호출)
function RCT:ApplyPoint(targetFrame, pointData)
    if not targetFrame or not pointData then return end
    targetFrame:ClearAllPoints()
    targetFrame:SetPoint(
        pointData.point or "TOPLEFT",
        UIParent,
        pointData.relPoint or "TOPLEFT",
        pointData.x or 0,
        pointData.y or 0
    )
end

function RCT:SavePoint(targetFrame, dbKey)
    if not targetFrame then return end
    local point, _, relPoint, x, y = targetFrame:GetPoint()
    RCT.db[dbKey] = { point = point, relPoint = relPoint, x = x, y = y }
end

-- ADDON_LOADED 이벤트
RCT:RegisterEvent("ADDON_LOADED", function(self, loadedAddon)
    if loadedAddon == addonName then
        RCT:UnregisterEvent("ADDON_LOADED")
        RCT:Init()
    end
end)
