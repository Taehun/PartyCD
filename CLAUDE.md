# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RaidCD is a static web viewer that reads WoW combat log files (`WoWCombatLog-*.txt`) in the browser via the File System Access API and renders raid cooldowns + death log in real time. Written as vanilla JS/CSS/HTML with no build step. Deployed automatically to GitHub Pages from `viewer/` on push to `main`.

The project originally shipped as both a WoW addon (Lua) and a web viewer; the addon component has been removed and the viewer is now the sole product.

## Running locally

```bash
cd viewer
npx serve .          # or: python3 -m http.server 8000
```

`file://` blocks the File System Access API — you must serve over HTTP. Chromium-only (FSA API not available in Firefox/Safari).

## Testing

```bash
cd viewer
npm test
```

Node `--test` runs `test/parser.test.js` (~40 unit tests covering `SPELL_CAST_SUCCESS`, `SPELL_AURA_APPLIED`, `SPELL_INTERRUPT`, `UNIT_DIED`, `ENCOUNTER_START/END`, `SPELL_DAMAGE` / `SPELL_PERIODIC_DAMAGE` / `SWING_DAMAGE`, CRLF handling, koKR character names).

## Architecture (`viewer/`)

WoW in-game UI theme: dark slate background, gold/bronze borders, EB Garamond display + Inter body + Space Grotesk mono. Spell icons load from Wowhead CDN (`https://wow.zamimg.com/images/wow/icons/large/{iconName}.jpg`) with 2-letter abbreviation fallback.

| File | Role |
|---|---|
| `viewer/spells.js` | Static spell database — each spell carries `iconName` (Wowhead), `abbr` (fallback), `nameKo` (localized). Categories: `SURVIVAL`, `RAID_CD`, `HEROISM`, `BATTLEREZ`. |
| `viewer/parser.js` | Combat-log line parser (pure, stateless). Handles quoted commas, affiliation flags, aura remapping. Events: `SPELL_CAST_SUCCESS`, `SPELL_AURA_APPLIED`, `SPELL_INTERRUPT`, `UNIT_DIED`, `ENCOUNTER_START/END`, `SPELL_DAMAGE`/`SPELL_PERIODIC_DAMAGE`/`SWING_DAMAGE`. |
| `viewer/app.js` | Directory polling (500ms), **streaming log reader** (`Blob.stream()` + `TextDecoderStream` + per-line `indexOf('\n')`) to avoid OOM on large logs, state store (players/deaths/damageBuffer/encounter), grid + utility card + death log rendering, hover tooltip, IndexedDB handle persistence. Demo mode via `?demo=1`. |
| `viewer/i18n.js` | ko / en translations + locale picker. |
| `viewer/index.html`, `style.css` | Static shell, WoW UI theme. |
| `viewer/test/parser.test.js` | `node --test` unit tests. |

### UI structure

SURVIVAL grid + RAID CD grid (one icon per spell with `×N` count badge top-right and ready-count green badge bottom-right; radial conic-gradient cooldown sweep + center timer; gold border glow when all instances ready; hover popover lists each owner with individual cooldown). HEROISM card (single indicator — any one caster firing consumes all). BATTLE REZ card (charge count = number of ready spell instances; greys out when 0; shows next-charge timer). DEATH LOG (collapsible rows ascending by death time; expanded row shows last 10 seconds of damage taken; cleared on `ENCOUNTER_START`).

### Log streaming (OOM protection)

`pollOnce()` does **not** slurp the file delta as a single string. It streams the `Blob.slice()` via `TextDecoderStream` (native UTF-8 chunk-boundary handling for koKR multi-byte chars), emits complete lines as they arrive using an incremental `indexOf('\n')` scan, and only commits `readPosition` / `residualBuffer` after the full stream is consumed — so a mid-stream throw leaves the poll cleanly retriable on the next tick. `MAX_RESIDUAL_BYTES = 16MB` guards against corrupt (no-`\n`) payloads.

## Deployment

`.github/workflows/pages.yml` runs parser tests, then publishes `viewer/` to GitHub Pages on every push to `main` that touches `viewer/**`. Live URL: https://taehun.github.io/RaidCD/.

## Code Conventions

- Bilingual: Korean is the primary user language in UI copy and commit messages
- Fix tags in comments: `FIX-1`, `RT-1` etc. for traceability
- Cross-realm player names normalized via caller-side string handling (parser returns raw)
- Conventional Commits (`feat(viewer)`, `perf(viewer)`, `fix(parser)` 등)

## Useful References

- WoW API / combat log format: wiki.gg/wow, wowpedia
- Spell data verification: Wowhead
- File System Access API: https://wicg.github.io/file-system-access/
