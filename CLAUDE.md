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

## Web Viewer (`viewer/`)

Static web companion that tails `Logs/WoWCombatLog-*.txt` via the browser's File System Access API to display raid cooldowns + death log, as a workaround for Secret Values limits. Pure vanilla JS, no build step, no server.

WoW in-game UI theme: dark slate background, gold/bronze borders, EB Garamond display + Inter body + Space Grotesk mono. Spell icons load from Wowhead CDN (`https://wow.zamimg.com/images/wow/icons/large/{iconName}.jpg`) with 2-letter abbreviation fallback.

| File | Role |
|---|---|
| `viewer/spells.js` | Port of `PartyCD/SpellData.lua` plus `iconName` (Wowhead) and `abbr` (fallback). **Must be kept in sync when adding spells.** |
| `viewer/parser.js` | Combat log line parser (pure function). Handles quoted commas, affiliation flags, aura remapping. Events: `SPELL_CAST_SUCCESS`, `SPELL_AURA_APPLIED`, `SPELL_INTERRUPT`, `UNIT_DIED`, `ENCOUNTER_START`/`END`, `SPELL_DAMAGE`/`SPELL_PERIODIC_DAMAGE`/`SWING_DAMAGE`. |
| `viewer/app.js` | Directory polling (500ms), state store (players/deaths/damageBuffer/encounter), grid + utility card + death log rendering, hover tooltip, IndexedDB handle persistence. Demo mode via `?demo=1`. |
| `viewer/i18n.js` | ko / en translations + locale picker. |
| `viewer/index.html`, `style.css` | Static shell, WoW UI theme. |
| `viewer/test/parser.test.js` | `node --test` unit tests, 30 tests (`npm test` in `viewer/`). |

UI structure: SURVIVAL grid + RAID CD grid (one icon per spell with `×N` count badge top-right and ready-count green badge bottom-right; radial conic-gradient cooldown sweep + center timer; gold border glow when all instances ready; hover popover lists each owner with individual cooldown). HEROISM card (single indicator — any one caster firing consumes all). BATTLE REZ card (charge count = number of ready spell instances; greys out when 0; shows next-charge timer). DEATH LOG (collapsible rows ascending by death time; expanded row shows last 10 seconds of damage taken; cleared on `ENCOUNTER_START`).

Chromium-only. Run via local static server (`npx serve viewer`) — `file://` blocks File System Access API.

## Useful References

- WoW API: wiki.gg/wow, wowpedia
- Spell data verification: Wowhead
- Distribution: CurseForge, GitHub Releases
