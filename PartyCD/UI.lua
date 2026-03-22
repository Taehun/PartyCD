-- UI.lua: 쿨타임 표시 UI
local addonName, RCT = ...

-- UI 컨테이너
local survivalFrame, interruptFrame

-- 바 높이/간격
local BAR_HEIGHT = 20
local BAR_WIDTH = 200
local BAR_SPACING = 2
local ICON_SIZE = 20

function RCT:InitUI()
    local L = RCT.L
    survivalFrame = RCT:CreateContainer("PCD_SurvivalFrame", L.TITLE_SURVIVAL)
    interruptFrame = RCT:CreateContainer("PCD_InterruptFrame", L.TITLE_INTERRUPT)

    -- RT-1: 저장된 위치 복원 (key-value 구조)
    if RCT.db.survivalPoint then
        RCT:ApplyPoint(survivalFrame, RCT.db.survivalPoint)
    end
    if RCT.db.interruptPoint then
        RCT:ApplyPoint(interruptFrame, RCT.db.interruptPoint)
    end

    RCT:UpdateVisibility()

    -- 콜백 등록
    RCT.OnCooldownUpdate = RCT.RefreshUI
    RCT.OnFrameUpdate = RCT.UpdateBars
    RCT.OnRosterUpdate = RCT.RefreshUI
end

-- 컨테이너 프레임 생성
function RCT:CreateContainer(name, title)
    local f = CreateFrame("Frame", name, UIParent, "BackdropTemplate")
    f:SetSize(BAR_WIDTH + ICON_SIZE + 10, 30)
    f:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 20, -200)

    f:SetBackdrop({
        bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
        edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
        tile = true, tileSize = 16, edgeSize = 12,
        insets = { left = 2, right = 2, top = 2, bottom = 2 },
    })
    f:SetBackdropColor(0, 0, 0, 0.7)
    f:SetBackdropBorderColor(0.5, 0.5, 0.5, 0.8)

    -- 타이틀
    local titleText = f:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    titleText:SetPoint("TOPLEFT", 5, -5)
    titleText:SetText("|cffffd100" .. title .. "|r")
    f.title = titleText

    -- 드래그 가능
    f:SetMovable(true)
    f:EnableMouse(true)
    f:RegisterForDrag("LeftButton")
    f:SetScript("OnDragStart", function(self)
        if not RCT.db.locked then
            self:StartMoving()
        end
    end)
    f:SetScript("OnDragStop", function(self)
        self:StopMovingOrSizing()
        -- RT-1: key-value 구조로 위치 저장
        local dbKey = (name == "PCD_SurvivalFrame") and "survivalPoint" or "interruptPoint"
        RCT:SavePoint(self, dbKey)
    end)

    f.bars = {}
    return f
end

-- 쿨다운 바 생성/재사용
local function GetOrCreateBar(parent, index)
    if parent.bars[index] then
        parent.bars[index]:Show()
        return parent.bars[index]
    end

    local bar = CreateFrame("StatusBar", nil, parent)
    bar:SetSize(BAR_WIDTH, BAR_HEIGHT)
    bar:SetPoint("TOPLEFT", parent, "TOPLEFT", ICON_SIZE + 8, -(20 + (index - 1) * (BAR_HEIGHT + BAR_SPACING)))
    bar:SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar")
    bar:SetMinMaxValues(0, 1)

    -- 배경
    local bg = bar:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints()
    bg:SetColorTexture(0.1, 0.1, 0.1, 0.8)

    -- 아이콘
    local icon = bar:CreateTexture(nil, "OVERLAY")
    icon:SetSize(ICON_SIZE, ICON_SIZE)
    icon:SetPoint("RIGHT", bar, "LEFT", -3, 0)
    bar.icon = icon

    -- 스킬명 텍스트
    local nameText = bar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    nameText:SetPoint("LEFT", 3, 0)
    nameText:SetJustifyH("LEFT")
    bar.nameText = nameText

    -- 남은 시간 텍스트
    local timeText = bar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    timeText:SetPoint("RIGHT", -3, 0)
    timeText:SetJustifyH("RIGHT")
    bar.timeText = timeText

    -- BUG-3: 경량 업데이트용 메타데이터
    bar.playerName = nil
    bar.spellID = nil
    bar.duration = 0

    parent.bars[index] = bar
    return bar
end

-- BUG-6: 시간 포맷 - math.floor 적용
local function FormatTime(seconds)
    local L = RCT.L
    if seconds <= 0 then
        return L.READY
    elseif seconds < 60 then
        return string.format(L.SEC_FORMAT, seconds)
    else
        local s = math.floor(seconds)
        return string.format(L.MIN_FORMAT, math.floor(s / 60), s % 60)
    end
end

-- REFACTOR-2: Blizzard 전역 RAID_CLASS_COLORS 사용
local function GetClassColor(classFile)
    local cc = RAID_CLASS_COLORS and RAID_CLASS_COLORS[classFile]
    if cc then
        return cc.r, cc.g, cc.b
    end
    return 1, 1, 1
end

-- REFACTOR-1: 공통 컨테이너 UI 갱신 함수
local function RefreshContainerUI(container, entries, showSetting)
    if not showSetting then return end

    -- 기존 바 숨기기
    for _, bar in ipairs(container.bars) do
        bar:Hide()
    end

    -- 남은 시간 순 정렬 (준비된 것 먼저, 그 다음 쿨타임 짧은 순)
    table.sort(entries, function(a, b)
        if a.remaining == 0 and b.remaining == 0 then
            return a.name < b.name
        end
        if a.remaining == 0 then return true end
        if b.remaining == 0 then return false end
        return a.remaining < b.remaining
    end)

    local index = 0
    for _, entry in ipairs(entries) do
        index = index + 1
        local bar = GetOrCreateBar(container, index)

        -- 클래스 색상
        local r, g, b = GetClassColor(entry.class)
        bar:SetStatusBarColor(r, g, b, 0.8)

        -- 진행률
        if entry.duration > 0 and entry.remaining > 0 then
            bar:SetValue(1 - (entry.remaining / entry.duration))
        else
            bar:SetValue(1)
        end

        -- FIX-3: 아이콘 (pcall 보호)
        local ok, spellInfo = pcall(C_Spell.GetSpellInfo, entry.spellID)
        if ok and spellInfo and spellInfo.iconID then
            bar.icon:SetTexture(spellInfo.iconID)
        end

        -- 텍스트
        local addonMarker = entry.hasAddon and "" or " *"
        bar.nameText:SetText(entry.name .. addonMarker)
        bar.timeText:SetText(FormatTime(entry.remaining))

        -- BUG-3: 경량 업데이트용 메타데이터 저장
        bar.playerName = entry.name
        bar.spellID = entry.spellID
        bar.duration = entry.duration
    end

    -- 프레임 크기 조정
    local totalHeight = 22 + math.max(1, index) * (BAR_HEIGHT + BAR_SPACING)
    container:SetHeight(totalHeight)
    container:SetWidth(BAR_WIDTH + ICON_SIZE + 10)

    if index == 0 then
        container:Hide()
    else
        container:Show()
    end
end

-- 엔트리 수집: 힐러 생존기
local function CollectSurvivalEntries()
    local entries = {}
    local healers = RCT:GetHealers()
    for name, memberData in pairs(healers) do
        local trackedSpells = RCT:GetTrackedSpellsForUnit(name)
        for spellID, spellData in pairs(trackedSpells) do
            local remaining, duration = RCT:GetCooldownRemaining(name, spellID)
            entries[#entries + 1] = {
                name = name,
                spellID = spellID,
                class = memberData.class,
                remaining = remaining,
                duration = duration,
                hasAddon = memberData.hasAddon,
            }
        end
    end
    return entries
end

-- 엔트리 수집: 차단기
local function CollectInterruptEntries()
    local entries = {}
    local interrupters = RCT:GetPartyInterrupters()
    for name, memberData in pairs(interrupters) do
        local trackedSpells = RCT:GetTrackedSpellsForUnit(name)
        for spellID, spellData in pairs(trackedSpells) do
            local remaining, duration = RCT:GetCooldownRemaining(name, spellID)
            entries[#entries + 1] = {
                name = name,
                spellID = spellID,
                class = memberData.class,
                remaining = remaining,
                duration = duration,
                hasAddon = memberData.hasAddon,
            }
        end
    end
    return entries
end

-- UI 전체 갱신
function RCT:RefreshUI()
    RefreshContainerUI(survivalFrame, CollectSurvivalEntries(), RCT.db.showSurvival)
    RefreshContainerUI(interruptFrame, CollectInterruptEntries(), RCT.db.showInterrupt)
end

-- BUG-3: 0.1초 주기 경량 업데이트 (timeText + 진행률만 갱신)
function RCT:UpdateBars()
    RCT:UpdateContainerBars(survivalFrame)
    RCT:UpdateContainerBars(interruptFrame)
end

function RCT:UpdateContainerBars(container)
    for _, bar in ipairs(container.bars) do
        if bar:IsShown() and bar.playerName and bar.spellID then
            local remaining, duration = RCT:GetCooldownRemaining(bar.playerName, bar.spellID)
            bar.timeText:SetText(FormatTime(remaining))
            if duration > 0 and remaining > 0 then
                bar:SetValue(1 - (remaining / duration))
            else
                bar:SetValue(1)
            end
        end
    end
end

-- 프레임 잠금 상태 업데이트
function RCT:UpdateFrameLock()
    -- 잠금 시 드래그 비활성화는 OnDragStart에서 처리
end

-- 표시/숨김 토글
function RCT:UpdateVisibility()
    if RCT.db.showSurvival then
        RefreshContainerUI(survivalFrame, CollectSurvivalEntries(), true)
    else
        survivalFrame:Hide()
    end
    if RCT.db.showInterrupt then
        RefreshContainerUI(interruptFrame, CollectInterruptEntries(), true)
    else
        interruptFrame:Hide()
    end
end

-- 위치 초기화
function RCT:ResetPositions()
    RCT.db.survivalPoint = { point = "TOPLEFT", relPoint = "TOPLEFT", x = 20, y = -200 }
    RCT:ApplyPoint(survivalFrame, RCT.db.survivalPoint)

    RCT.db.interruptPoint = { point = "TOPLEFT", relPoint = "TOPLEFT", x = 20, y = -400 }
    RCT:ApplyPoint(interruptFrame, RCT.db.interruptPoint)
end
