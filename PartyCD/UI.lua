-- UI.lua: OmniCD 스타일 아이콘 그리드 쿨타임 표시
local addonName, RCT = ...

-- 상수
local ICON_SIZE = 30
local ICON_SPACING = 3
local BORDER_SIZE = 2
local TITLE_HEIGHT = 16
local NAME_FONT_SIZE = 8
local TIME_FONT_SIZE = 12
local CELL_WIDTH = ICON_SIZE + BORDER_SIZE * 2
local CELL_HEIGHT = ICON_SIZE + BORDER_SIZE * 2 + 14

-- 기본 폰트 경로 (로케일 호환)
local FONT_PATH = STANDARD_TEXT_FONT or "Fonts\\FRIZQT__.TTF"

-- 컨테이너 프레임
local survivalFrame, interruptFrame

-- Blizzard 클래스 색상
local function GetClassColor(classFile)
    local cc = RAID_CLASS_COLORS and RAID_CLASS_COLORS[classFile]
    if cc then return cc.r, cc.g, cc.b end
    return 1, 1, 1
end

-- 시간 포맷 (아이콘 오버레이용 - 짧은 형식)
local function FormatTime(seconds)
    if seconds <= 0 then return "" end
    if seconds < 60 then
        return string.format("%.0f", seconds)
    else
        return string.format("%d:%02d", math.floor(seconds / 60), math.floor(seconds) % 60)
    end
end

-- 쿨다운 아이콘 생성
local function CreateIcon(parent, index)
    local cellFrame = CreateFrame("Frame", nil, parent)
    cellFrame:SetSize(CELL_WIDTH, CELL_HEIGHT)

    -- 아이콘 컨테이너 (테두리 포함)
    local iconFrame = CreateFrame("Frame", nil, cellFrame)
    iconFrame:SetSize(ICON_SIZE + BORDER_SIZE * 2, ICON_SIZE + BORDER_SIZE * 2)
    iconFrame:SetPoint("TOP", cellFrame, "TOP", 0, 0)

    -- 테두리 배경 (클래스 색상)
    local border = iconFrame:CreateTexture(nil, "BACKGROUND")
    border:SetAllPoints()
    border:SetColorTexture(1, 1, 1, 1)
    cellFrame.border = border

    -- 스펠 아이콘
    local icon = iconFrame:CreateTexture(nil, "ARTWORK")
    icon:SetSize(ICON_SIZE, ICON_SIZE)
    icon:SetPoint("CENTER")
    icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    cellFrame.icon = icon

    -- 쿨다운 스윕 오버레이 (Blizzard 내장)
    local cooldown = CreateFrame("Cooldown", nil, iconFrame, "CooldownFrameTemplate")
    cooldown:SetAllPoints(icon)
    cooldown:SetDrawEdge(true)
    cooldown:SetDrawBling(true)
    cooldown:SetHideCountdownNumbers(true)
    cellFrame.cooldown = cooldown

    -- 남은 시간 텍스트 (아이콘 중앙)
    local timeText = iconFrame:CreateFontString(nil, "OVERLAY")
    timeText:SetFont(FONT_PATH, TIME_FONT_SIZE, "OUTLINE")
    timeText:SetPoint("CENTER", icon, "CENTER", 0, 0)
    timeText:SetTextColor(1, 1, 1, 1)
    cellFrame.timeText = timeText

    -- 플레이어 이름 (아이콘 아래)
    local nameText = cellFrame:CreateFontString(nil, "OVERLAY")
    nameText:SetFont(FONT_PATH, NAME_FONT_SIZE, "OUTLINE")
    nameText:SetPoint("TOP", iconFrame, "BOTTOM", 0, -1)
    nameText:SetWidth(CELL_WIDTH + 6)
    nameText:SetJustifyH("CENTER")
    nameText:SetWordWrap(false)
    cellFrame.nameText = nameText

    -- 메타데이터
    cellFrame.playerName = nil
    cellFrame.spellID = nil
    cellFrame.currentStartTime = nil
    cellFrame.currentDuration = nil

    parent.icons[index] = cellFrame
    return cellFrame
end

-- 아이콘 가져오기/생성
local function GetOrCreateIcon(parent, index)
    if parent.icons[index] then
        parent.icons[index]:Show()
        return parent.icons[index]
    end
    return CreateIcon(parent, index)
end

-- 컨테이너 프레임 생성
function RCT:CreateContainer(name, title)
    local f = CreateFrame("Frame", name, UIParent, "BackdropTemplate")
    f:SetSize(200, 60)
    f:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 20, -200)

    f:SetBackdrop({
        bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
        edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
        tile = true, tileSize = 16, edgeSize = 12,
        insets = { left = 2, right = 2, top = 2, bottom = 2 },
    })
    f:SetBackdropColor(0, 0, 0, 0.75)
    f:SetBackdropBorderColor(0.4, 0.4, 0.4, 0.8)

    -- 타이틀
    local titleText = f:CreateFontString(nil, "OVERLAY")
    titleText:SetFont(FONT_PATH, 10, "OUTLINE")
    titleText:SetPoint("TOPLEFT", 6, -4)
    titleText:SetTextColor(1, 0.82, 0, 1)
    titleText:SetText(title)
    f.title = titleText

    -- 드래그 기능
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
        local dbKey = (name == "PCD_SurvivalFrame") and "survivalPoint" or "interruptPoint"
        RCT:SavePoint(self, dbKey)
    end)

    f.icons = {}
    return f
end

-- 단일 아이콘 업데이트
local function UpdateIcon(cellFrame, entry)
    -- 클래스 색상 테두리
    local r, g, b = GetClassColor(entry.class)
    cellFrame.border:SetColorTexture(r, g, b, 1)

    -- 스펠 아이콘 텍스처
    local ok, iconID = pcall(C_Spell.GetSpellTexture, entry.spellID)
    if ok and iconID then
        cellFrame.icon:SetTexture(iconID)
    end

    -- 쿨다운 상태
    if entry.remaining > 0 and entry.duration > 0 then
        -- 쿨타임 중: 회색조 + 스윕 + 시간 표시
        cellFrame.icon:SetDesaturated(true)
        cellFrame.icon:SetAlpha(0.6)

        local startTime = entry.startTime or (GetTime() - (entry.duration - entry.remaining))
        if cellFrame.currentStartTime ~= startTime or cellFrame.currentDuration ~= entry.duration then
            cellFrame.cooldown:SetCooldown(startTime, entry.duration)
            cellFrame.currentStartTime = startTime
            cellFrame.currentDuration = entry.duration
        end

        cellFrame.timeText:SetText(FormatTime(entry.remaining))
        cellFrame.timeText:Show()
    else
        -- 준비됨: 풀 컬러
        cellFrame.icon:SetDesaturated(false)
        cellFrame.icon:SetAlpha(1.0)
        if cellFrame.currentStartTime then
            cellFrame.cooldown:Clear()
            cellFrame.currentStartTime = nil
            cellFrame.currentDuration = nil
        end
        cellFrame.timeText:Hide()
    end

    -- 플레이어 이름
    local displayName = entry.name
    if #displayName > 6 then
        displayName = displayName:sub(1, 5) .. ".."
    end
    cellFrame.nameText:SetText(displayName)
    cellFrame.nameText:SetTextColor(r, g, b, 1)

    -- 메타데이터 저장
    cellFrame.playerName = entry.name
    cellFrame.spellID = entry.spellID
end

-- 컨테이너 UI 갱신
local function RefreshContainerUI(container, entries, showSetting)
    if not container then return end
    if not showSetting then
        container:Hide()
        return
    end

    -- 기존 아이콘 숨기기
    for _, icon in pairs(container.icons) do
        icon:Hide()
    end

    -- 정렬: 준비된 것 먼저, 그 다음 남은 시간 짧은 순
    table.sort(entries, function(a, b)
        if a.remaining == 0 and b.remaining == 0 then
            return a.name < b.name
        end
        if a.remaining == 0 then return true end
        if b.remaining == 0 then return false end
        if a.remaining == b.remaining then return a.name < b.name end
        return a.remaining < b.remaining
    end)

    local count = 0
    for _, entry in ipairs(entries) do
        count = count + 1
        local cellFrame = GetOrCreateIcon(container, count)
        cellFrame:SetPoint("TOPLEFT", container, "TOPLEFT",
            6 + (count - 1) * (CELL_WIDTH + ICON_SPACING),
            -(TITLE_HEIGHT + 2))
        UpdateIcon(cellFrame, entry)
    end

    if count == 0 then
        container:Hide()
    else
        local totalWidth = 12 + count * CELL_WIDTH + math.max(0, count - 1) * ICON_SPACING
        local totalHeight = TITLE_HEIGHT + CELL_HEIGHT + 8
        container:SetSize(math.max(totalWidth, 60), totalHeight)
        container:Show()
    end
end

-- 엔트리 수집: 힐러 생존기
local function CollectSurvivalEntries()
    local entries = {}
    local healers = RCT:GetHealers()
    for name, memberData in pairs(healers) do
        local trackedSpells = RCT:GetTrackedSpellsForUnit(name, "SURVIVAL")
        for spellID, spellData in pairs(trackedSpells) do
            local remaining, duration = RCT:GetCooldownRemaining(name, spellID)
            local cdData = RCT.cooldowns[name .. ":" .. spellID]
            entries[#entries + 1] = {
                name = name,
                spellID = spellID,
                class = memberData.class,
                remaining = remaining,
                duration = duration,
                startTime = cdData and cdData.startTime or nil,
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
        local trackedSpells = RCT:GetTrackedSpellsForUnit(name, "INTERRUPT")
        for spellID, spellData in pairs(trackedSpells) do
            local remaining, duration = RCT:GetCooldownRemaining(name, spellID)
            local cdData = RCT.cooldowns[name .. ":" .. spellID]
            entries[#entries + 1] = {
                name = name,
                spellID = spellID,
                class = memberData.class,
                remaining = remaining,
                duration = duration,
                startTime = cdData and cdData.startTime or nil,
            }
        end
    end
    return entries
end

-- UI 전체 갱신
function RCT:RefreshUI()
    if not survivalFrame or not interruptFrame then return end
    RefreshContainerUI(survivalFrame, CollectSurvivalEntries(), RCT.db.showSurvival)
    RefreshContainerUI(interruptFrame, CollectInterruptEntries(), RCT.db.showInterrupt)
end

-- 쿨다운 이벤트 시 즉시 리빌드 대신 dirty 플래그 설정 (0.1초 주기 배치 갱신)
local refreshPending = false
function RCT:RequestRefresh()
    refreshPending = true
end

-- 경량 업데이트 (시간 텍스트 + 아이콘 상태만, 스윕은 CooldownFrameTemplate이 처리)
function RCT:UpdateBars()
    if refreshPending then
        refreshPending = false
        RCT:RefreshUI()
    end
    RCT:UpdateContainerIcons(survivalFrame)
    RCT:UpdateContainerIcons(interruptFrame)
end

function RCT:UpdateContainerIcons(container)
    if not container or not container:IsShown() then return end
    for _, cellFrame in pairs(container.icons) do
        if cellFrame:IsShown() and cellFrame.playerName and cellFrame.spellID then
            local remaining = RCT:GetCooldownRemaining(cellFrame.playerName, cellFrame.spellID)
            if remaining > 0 then
                cellFrame.timeText:SetText(FormatTime(remaining))
                cellFrame.timeText:Show()
                cellFrame.icon:SetDesaturated(true)
                cellFrame.icon:SetAlpha(0.6)
            else
                cellFrame.timeText:Hide()
                cellFrame.icon:SetDesaturated(false)
                cellFrame.icon:SetAlpha(1.0)
                if cellFrame.currentStartTime then
                    cellFrame.cooldown:Clear()
                    cellFrame.currentStartTime = nil
                    cellFrame.currentDuration = nil
                end
            end
        end
    end
end

-- 프레임 잠금 상태 업데이트
function RCT:UpdateFrameLock()
    -- 잠금은 OnDragStart에서 처리
end

-- 표시/숨김 토글
function RCT:UpdateVisibility()
    if not survivalFrame or not interruptFrame then return end
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
    if not survivalFrame or not interruptFrame then return end
    RCT.db.survivalPoint = { point = "TOPLEFT", relPoint = "TOPLEFT", x = 20, y = -200 }
    RCT:ApplyPoint(survivalFrame, RCT.db.survivalPoint)

    RCT.db.interruptPoint = { point = "TOPLEFT", relPoint = "TOPLEFT", x = 20, y = -400 }
    RCT:ApplyPoint(interruptFrame, RCT.db.interruptPoint)
end

-- UI 초기화
function RCT:InitUI()
    local L = RCT.L
    survivalFrame = RCT:CreateContainer("PCD_SurvivalFrame", L.TITLE_SURVIVAL)
    interruptFrame = RCT:CreateContainer("PCD_InterruptFrame", L.TITLE_INTERRUPT)

    -- 저장된 위치 복원
    if RCT.db.survivalPoint then
        RCT:ApplyPoint(survivalFrame, RCT.db.survivalPoint)
    end
    if RCT.db.interruptPoint then
        RCT:ApplyPoint(interruptFrame, RCT.db.interruptPoint)
    end

    -- 콜백 등록
    RCT.OnCooldownUpdate = RCT.RequestRefresh
    RCT.OnFrameUpdate = RCT.UpdateBars
    RCT.OnRosterUpdate = RCT.RefreshUI

    -- 초기에는 숨김 (roster 데이터 도착 후 표시)
    survivalFrame:Hide()
    interruptFrame:Hide()

    -- 지연 RefreshUI: 이미 그룹에 있을 때를 대비
    C_Timer.After(2, function()
        if IsInGroup() or IsInRaid() then
            RCT:RefreshUI()
        end
    end)
end
