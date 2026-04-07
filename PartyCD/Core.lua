-- Core.lua: 애드온 초기화 및 이벤트 프레임
local addonName, RCT = ...

RCT.version = "1.1.0"
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

-- FIX-9: 모든 이벤트 핸들러를 pcall로 보호 — Secret Values 에러 방지
frame:SetScript("OnEvent", function(self, event, ...)
    local handlers = eventHandlers[event]
    if handlers then
        for _, handler in ipairs(handlers) do
            local ok, err = pcall(handler, RCT, ...)
            if not ok and RCT.debug then
                print("|cffff8800[PCD]|r " .. event .. " handler error: " .. tostring(err))
            end
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
    -- FIX-8: 파일 로딩 마커 체크
    if not RCT._trackerLoaded then
        print("|cffff0000[PartyCD]|r CooldownTracker.lua 로딩 실패 — 파일 문법 오류 가능")
    end
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

    -- FIX-5: 모든 모듈 초기화 완료 후 즉시 roster + UI refresh (콜백 보장됨)
    if (IsInGroup() or IsInRaid()) and RCT.UpdateRoster then
        RCT:Debug("Init: already in group, immediate UpdateRoster")
        RCT:UpdateRoster()
    end

    -- 지연 재시도: 유닛 데이터가 아직 준비 안 됐을 경우 대비
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
        if RCT.UpdateRoster then RCT:UpdateRoster() end
        if RCT.RefreshUI then RCT:RefreshUI() end
        print(L.POSITION_RESET)
    elseif msg == "survival" then
        RCT.db.showSurvival = not RCT.db.showSurvival
        RCT:UpdateVisibility()
        print(RCT.db.showSurvival and L.SURVIVAL_ON or L.SURVIVAL_OFF)
    elseif msg == "interrupt" then
        RCT.db.showInterrupt = not RCT.db.showInterrupt
        RCT:UpdateVisibility()
        print(RCT.db.showInterrupt and L.INTERRUPT_ON or L.INTERRUPT_OFF)
    elseif msg == "show" then
        -- 강제 표시: showSurvival/showInterrupt를 true로 설정하고 강제 갱신
        RCT.db.showSurvival = true
        RCT.db.showInterrupt = true
        if RCT.UpdateRoster then RCT:UpdateRoster() end
        if RCT.RefreshUI then RCT:RefreshUI() end
        -- 프레임이 여전히 숨겨져 있으면 강제 Show
        local sf = _G["PCD_SurvivalFrame"]
        local intf = _G["PCD_InterruptFrame"]
        if sf and not sf:IsShown() then
            sf:SetSize(160, 36)
            sf:Show()
        end
        if intf and not intf:IsShown() then
            intf:SetSize(160, 36)
            intf:Show()
        end
        print("|cff00ff00[PartyCD]|r Force show: survival=" .. (sf and (sf:IsShown() and "SHOWN" or "HIDDEN") or "nil")
            .. " interrupt=" .. (intf and (intf:IsShown() and "SHOWN" or "HIDDEN") or "nil"))
    -- FIX-5: 간결한 진단 출력 (pcall로 에러 캡처)
    elseif msg == "diag" then
        print("|cff00ff00[PartyCD] Diagnostics v" .. RCT.version .. ":|r")
        print("  Group: " .. tostring(IsInGroup()) .. " Raid: " .. tostring(IsInRaid()) .. " Members: " .. GetNumGroupMembers() .. " mySG: " .. tostring(RCT.mySubgroup))
        local rosterCount, onlineCount = 0, 0
        for _, data in pairs(RCT.roster) do
            rosterCount = rosterCount + 1
            if data.online then onlineCount = onlineCount + 1 end
        end
        print("  Roster: " .. rosterCount .. " total, " .. onlineCount .. " online")
        local healerCount, intCount = 0, 0
        if RCT.GetHealers then for _ in pairs(RCT:GetHealers()) do healerCount = healerCount + 1 end end
        if RCT.GetPartyInterrupters then for _ in pairs(RCT:GetPartyInterrupters()) do intCount = intCount + 1 end end
        print("  Healers: " .. healerCount .. " Interrupters: " .. intCount)
        -- 멤버별 추적 스펠 (에러 캡처)
        for name, data in pairs(RCT.roster) do
            local ok2, err2 = pcall(function()
                local sc, ic = 0, 0
                for _ in pairs(RCT:GetTrackedSpellsForUnit(name, "SURVIVAL")) do sc = sc + 1 end
                for _ in pairs(RCT:GetTrackedSpellsForUnit(name, "INTERRUPT")) do ic = ic + 1 end
                print(string.format("    %s (%s/%s): surv=%d int=%d online=%s",
                    name, tostring(data.class), tostring(data.role), sc, ic, tostring(data.online)))
            end)
            if not ok2 then
                print(string.format("    |cffff0000%s: ERROR: %s|r", name, tostring(err2)))
            end
        end
        -- 엔트리 수집 테스트 (에러 캡처)
        if RCT.GetUIDebugInfo then
            local ok, result = pcall(RCT.GetUIDebugInfo, RCT)
            if ok then
                print("  SurvEntries: " .. result.survivalEntryCount .. " IntEntries: " .. result.interruptEntryCount)
                print("  SurvFrame: " .. (result.survivalShown and "SHOWN" or "HIDDEN") .. " IntFrame: " .. (result.interruptShown and "SHOWN" or "HIDDEN"))
            else
                print("  |cffff0000EntryCollection ERROR: " .. tostring(result) .. "|r")
            end
        end
        -- RefreshUI 테스트
        if RCT.RefreshUI then
            local ok3, err3 = pcall(RCT.RefreshUI, RCT)
            if not ok3 then
                print("  |cffff0000RefreshUI ERROR: " .. tostring(err3) .. "|r")
            else
                print("  RefreshUI: OK")
            end
        end
    -- FIX-2: 디버그 모드
    elseif msg == "debug" then
        RCT.debug = not RCT.debug
        print("|cff00ff00[PartyCD]|r Debug: " .. (RCT.debug and "ON" or "OFF"))
        if RCT.debug then
            -- 그룹 상태
            print("  IsInGroup: " .. tostring(IsInGroup()))
            print("  IsInRaid: " .. tostring(IsInRaid()))
            print("  GetNumGroupMembers: " .. tostring(GetNumGroupMembers()))
            print("  mySubgroup: " .. tostring(RCT.mySubgroup))

            -- 설정값
            print("  showSurvival: " .. tostring(RCT.db.showSurvival))
            print("  showInterrupt: " .. tostring(RCT.db.showInterrupt))
            print("  locked: " .. tostring(RCT.db.locked))
            if not RCT.db.showSurvival then
                print("  |cffff8800WARNING: showSurvival is OFF. Use /pcd survival to toggle or /pcd show to force|r")
            end
            if not RCT.db.showInterrupt then
                print("  |cffff8800WARNING: showInterrupt is OFF. Use /pcd interrupt to toggle or /pcd show to force|r")
            end

            -- Roster 상세
            local count = 0
            if RCT.roster then
                for name, data in pairs(RCT.roster) do
                    count = count + 1
                    print(string.format("  [%d] %s: class=%s role=%s sg=%s online=%s",
                        count, name, tostring(data.class), tostring(data.role),
                        tostring(data.subgroup), tostring(data.online)))
                end
            end
            if count == 0 then
                print("  |cffff0000roster: EMPTY|r")
            end

            -- Healers / Interrupters 수
            local healerCount, intCount = 0, 0
            if RCT.GetHealers then
                for _ in pairs(RCT:GetHealers()) do healerCount = healerCount + 1 end
            end
            if RCT.GetPartyInterrupters then
                for _ in pairs(RCT:GetPartyInterrupters()) do intCount = intCount + 1 end
            end
            print("  healers: " .. healerCount .. ", interrupters: " .. intCount)

            -- 강제 UI 갱신
            if RCT.UpdateRoster then RCT:UpdateRoster() end
            if RCT.RefreshUI then RCT:RefreshUI() end

            -- 갱신 후 프레임 상태 + entry count
            local sf = _G["PCD_SurvivalFrame"]
            local intf = _G["PCD_InterruptFrame"]
            print("  survivalFrame: " .. (sf and (sf:IsShown() and "SHOWN" or "HIDDEN") or "|cffff0000NOT CREATED|r"))
            print("  interruptFrame: " .. (intf and (intf:IsShown() and "SHOWN" or "HIDDEN") or "|cffff0000NOT CREATED|r"))

            if RCT.GetUIDebugInfo then
                local info = RCT:GetUIDebugInfo()
                print("  survivalEntries: " .. info.survivalEntryCount .. ", interruptEntries: " .. info.interruptEntryCount)
            end

            -- 활성 쿨다운 목록
            local cdCount = 0
            if RCT.cooldowns then
                for key, data in pairs(RCT.cooldowns) do
                    cdCount = cdCount + 1
                    local rem = data.expires - GetTime()
                    print(string.format("  CD: %s remaining=%.1fs source=%s", key, rem, tostring(data.source)))
                end
            end
            print("  activeCooldowns: " .. cdCount)

            -- 화면 크기 + 프레임 좌표
            print("  screenSize: " .. GetScreenWidth() .. "x" .. GetScreenHeight())
            if sf and sf:GetPoint() then
                local p, _, rp, x, y = sf:GetPoint()
                print("  survivalPos: " .. tostring(p) .. "/" .. tostring(rp) .. " " .. tostring(x) .. "," .. tostring(y))
            end
            if intf and intf:GetPoint() then
                local p, _, rp, x, y = intf:GetPoint()
                print("  interruptPos: " .. tostring(p) .. "/" .. tostring(rp) .. " " .. tostring(x) .. "," .. tostring(y))
            end
        end
    else
        print(L.CMD_HELP_HEADER)
        print(L.CMD_LOCK)
        print(L.CMD_RESET)
        print(L.CMD_SURVIVAL)
        print(L.CMD_INTERRUPT)
        print("  /pcd show - Force show all frames")
        print("  /pcd debug - Toggle debug mode")
    end
end

-- SetPoint 헬퍼 (key-value 테이블 → SetPoint 호출)
-- 화면 밖 좌표 감지 시 defaultY 위치로 리셋 (프레임별 기본 위치 구분)
function RCT:ApplyPoint(targetFrame, pointData, defaultY)
    if not targetFrame or not pointData then return end

    local x = pointData.x or 0
    local y = pointData.y or 0
    local screenW = GetScreenWidth()
    local screenH = GetScreenHeight()

    -- 프레임이 화면 영역 밖이면 기본 위치로 리셋
    if x < -screenW or x > screenW or y < -screenH or y > screenH then
        RCT:Debug("Frame out of bounds (" .. x .. "," .. y .. "), resetting")
        x = 20
        y = defaultY or -200
        pointData.point = "TOPLEFT"
        pointData.relPoint = "TOPLEFT"
        pointData.x = x
        pointData.y = y
    end

    targetFrame:ClearAllPoints()
    targetFrame:SetPoint(
        pointData.point or "TOPLEFT",
        UIParent,
        pointData.relPoint or "TOPLEFT",
        x,
        y
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
