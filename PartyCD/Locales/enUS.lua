-- Locales/enUS.lua: English (default)
local addonName, RCT = ...

RCT.L = {
    -- Core
    ADDON_LOADED        = "|cff00ff00[PartyCD]|r v%s loaded",
    FRAME_LOCKED        = "|cff00ff00[PartyCD]|r Frame locked",
    FRAME_UNLOCKED      = "|cff00ff00[PartyCD]|r Frame unlocked",
    POSITION_RESET      = "|cff00ff00[PartyCD]|r Position reset",
    SURVIVAL_ON         = "|cff00ff00[PartyCD]|r Survival CDs: ON",
    SURVIVAL_OFF        = "|cff00ff00[PartyCD]|r Survival CDs: OFF",
    INTERRUPT_ON        = "|cff00ff00[PartyCD]|r Interrupt CDs: ON",
    INTERRUPT_OFF       = "|cff00ff00[PartyCD]|r Interrupt CDs: OFF",

    -- Slash commands
    CMD_HELP_HEADER     = "|cff00ff00[PartyCD]|r Commands:",
    CMD_LOCK            = "  /pcd lock - Lock/unlock frames",
    CMD_RESET           = "  /pcd reset - Reset positions",
    CMD_SURVIVAL        = "  /pcd survival - Toggle survival CDs",
    CMD_INTERRUPT       = "  /pcd interrupt - Toggle interrupt CDs",

    -- UI
    TITLE_SURVIVAL      = "Survival Cooldowns",
    TITLE_INTERRUPT     = "Interrupt Cooldowns",
    READY               = "|cff00ff00Ready|r",
    SEC_FORMAT          = "|cffff6600%.0fs|r",
    MIN_FORMAT          = "|cffff0000%d:%02d|r",
}
