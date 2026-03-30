-- Locales/koKR.lua: 한국어
local addonName, RCT = ...
if GetLocale() ~= "koKR" then return end

local L = RCT.L

-- Core
L.ADDON_LOADED        = "|cff00ff00[PartyCD]|r v%s 로드됨"
L.FRAME_LOCKED        = "|cff00ff00[PartyCD]|r 프레임 잠금"
L.FRAME_UNLOCKED      = "|cff00ff00[PartyCD]|r 프레임 잠금해제"
L.POSITION_RESET      = "|cff00ff00[PartyCD]|r 위치 초기화"
L.SURVIVAL_ON         = "|cff00ff00[PartyCD]|r 생존기 표시: ON"
L.SURVIVAL_OFF        = "|cff00ff00[PartyCD]|r 생존기 표시: OFF"
L.INTERRUPT_ON        = "|cff00ff00[PartyCD]|r 차단기 표시: ON"
L.INTERRUPT_OFF       = "|cff00ff00[PartyCD]|r 차단기 표시: OFF"

-- Slash commands
L.CMD_HELP_HEADER     = "|cff00ff00[PartyCD]|r 명령어:"
L.CMD_LOCK            = "  /pcd lock - 프레임 잠금/해제"
L.CMD_RESET           = "  /pcd reset - 위치 초기화"
L.CMD_SURVIVAL        = "  /pcd survival - 생존기 표시 토글"
L.CMD_INTERRUPT       = "  /pcd interrupt - 차단기 표시 토글"

-- UI
L.TITLE_SURVIVAL      = "생존기 쿨타임"
L.TITLE_INTERRUPT     = "차단기 쿨타임"
