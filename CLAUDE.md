# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PartyCD is a World of Warcraft addon for tracking party/raid cooldowns (healer survival CDs and DPS interrupt CDs). Targets WoW 12.0.1 (Midnight) — Interface version 120001. Written entirely in Lua with no external dependencies.

## Packaging

```bash
# Create distributable zip (excludes icon.svg source)
zip -r PartyCD.zip PartyCD/ -x "PartyCD/icon.svg"
```

There is no build step — Lua files are loaded directly by the WoW client.

## Testing

No automated test framework. Test manually in-game:
- `/pcd debug` toggles debug logging to chat
- `/pcd survival` and `/pcd interrupt` toggle display panels
- `/pcd lock` toggles frame dragging
- `/pcd reset` resets frame positions

## Architecture

Global namespace: `RCT` — all modules attach to this table.

**Load order** (defined in `PartyCD.toc`):
Locales → SpellData → RosterManager → CooldownTracker → AddonComm → UI → Core

| Module | Role |
|---|---|
| **Core.lua** | Event dispatcher, slash commands, initialization with `pcall` safety |
| **RosterManager.lua** | Maintains `RCT.roster` from GROUP_ROSTER_UPDATE; provides `GetHealers()`, `GetPartyInterrupters()`, `GetTrackedSpellsForUnit()` |
| **CooldownTracker.lua** | Hybrid cooldown detection: local via UNIT_SPELLCAST_SUCCEEDED + remote via addon comms. State in `RCT.cooldowns` keyed as `"playerName:spellID"` |
| **AddonComm.lua** | Prefix "PCD", messages: `CD:spellID:remaining:totalCD`, `SYNC`, `HI:version`. Throttled at 0.5s per spell. Channel: INSTANCE_CHAT for instances, else RAID/PARTY |
| **UI.lua** | Two draggable StatusBar containers (survival/interrupt). 0.1s refresh interval. Bars sorted ready-first then by remaining time |
| **SpellData.lua** | Static spell database (22 spells). Indexed by `RCT.SpellsByClass` for lookup |
| **Locales/** | `RCT.L` table pattern. enUS (default) + koKR overlay |

## Key WoW 12.0 Considerations

- **Secret Values**: WoW 12.0+ restricts spellID visibility in instanced content. All `C_Spell.GetSpellCooldown()` calls are wrapped in `pcall`.
- **Modern API**: Uses `C_Spell.GetSpellCooldown()` (not deprecated `GetSpellCooldown`), `C_ChatInfo.RegisterAddonMessagePrefix()`.
- **INSTANCE_CHAT**: Required for addon comms in mythic+/raids (detected via `LE_PARTY_CATEGORY_INSTANCE`).

## Code Conventions

- Fix tags in comments: `FIX-1`, `RT-1` etc. for traceability
- Cross-realm names normalized via `Ambiguate(name, "short")`
- SavedVariables: `PartyCDDB` (persisted settings)
- Class colors from `RAID_CLASS_COLORS`
- Bilingual: Korean is the primary user language

## Useful References

- WoW API: wiki.gg/wow, wowpedia
- Spell data verification: Wowhead
- Distribution: CurseForge, GitHub Releases
