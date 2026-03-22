-- Core.lua: 애드온 초기화 및 이벤트 프레임
local addonName, RCT = ...

RCT.version = "1.0.0"
RCT.addonPrefix = "PCD"

-- 메인 이벤트 프레임
local frame = CreateFrame("Frame", "PartyCDFrame", UIParent)

-- RT-1: SavedVariables에 nil이 들어가지 않도록 key-value 구조 사용
local defaults = {
    showSurvival = true,
    showInterrupt = true,
    locked = false,
    scale = 1.0,
    survivalPoint = { point = "TOPLEFT", relPoint = "TOPLEFT", x = 20, y = -200 },
    interruptPoint = { point = "TOPLEFT", relPoint = "TOPLEFT", x = 20, y = -400 },
}

-- RT-8: 이벤트 핸들러를 배열로 관리하여 복수 등록 지원
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

-- 초기화
function RCT:Init()
    -- SavedVariables 로드
    if not PartyCDDB then
        PartyCDDB = {}
    end
    for k, v in pairs(defaults) do
        if PartyCDDB[k] == nil then
            -- 테이블은 deep copy
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

    -- 모듈 초기화
    RCT:InitRoster()
    RCT:InitTracker()
    RCT:InitComm()
    RCT:InitUI()

    -- 슬래시 커맨드
    SLASH_PCD1 = "/pcd"
    SlashCmdList["PCD"] = function(msg)
        RCT:HandleSlashCommand(msg)
    end

    local L = RCT.L
    print(string.format(L.ADDON_LOADED, RCT.version))
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
    else
        print(L.CMD_HELP_HEADER)
        print(L.CMD_LOCK)
        print(L.CMD_RESET)
        print(L.CMD_SURVIVAL)
        print(L.CMD_INTERRUPT)
    end
end

-- RT-1: SetPoint 헬퍼 (key-value 테이블 → SetPoint 호출)
function RCT:ApplyPoint(frame, pointData)
    frame:ClearAllPoints()
    frame:SetPoint(pointData.point, UIParent, pointData.relPoint, pointData.x, pointData.y)
end

function RCT:SavePoint(frame, dbKey)
    local point, _, relPoint, x, y = frame:GetPoint()
    RCT.db[dbKey] = { point = point, relPoint = relPoint, x = x, y = y }
end

-- ADDON_LOADED 이벤트
RCT:RegisterEvent("ADDON_LOADED", function(self, loadedAddon)
    if loadedAddon == addonName then
        RCT:UnregisterEvent("ADDON_LOADED")
        RCT:Init()
    end
end)
