import { parseLine } from "./parser.js";
import { SpellData, CLASS_COLORS, iconUrl } from "./spells.js";
import { t, setLocale, getLocale, detectLocale, getAvailableLocales } from "./i18n.js";

// ============================================================
// 상수
// ============================================================
const POLL_INTERVAL_MS = 500;
const RENDER_INTERVAL_MS = 100;
const DAMAGE_BUFFER_MS = 10_000;        // 사망 직전 N ms 데미지 보존
const DAMAGE_BUFFER_TRIM_MS = 30_000;   // 메모리 보호용 cutoff
const DEATH_LIMIT = 30;
const IDB_NAME = "partycd-viewer";
const IDB_STORE = "handles";
const IDB_KEY = "logs-dir";

const SVG_NS = "http://www.w3.org/2000/svg";
const SKULL_PATH = "M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.5V20a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2.5c2.9-1.2 5-4.1 5-7.5a8 8 0 0 0-8-8zM9 11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z";

const CATEGORY_SECTIONS = {
  SURVIVAL: "survival",
  RAID_CD:  "raidcd",
};

const CATEGORY_SPELL_ORDER = (() => {
  const out = {};
  for (const cat of ["SURVIVAL", "RAID_CD", "HEROISM", "BATTLEREZ"]) {
    out[cat] = Object.entries(SpellData)
      .filter(([, s]) => s.category === cat)
      .map(([id]) => Number(id));
  }
  return out;
})();

// ============================================================
// 상태
// ============================================================
const state = {
  players: {},
  deaths: [],
  damageBuffer: {},
  encounter: null,
  currentFileName: null,
};

const expandedDeaths = new Set();

// ============================================================
// 엔트리
// ============================================================
async function main() {
  setLocale(detectLocale());
  initLangToggle();

  if (new URLSearchParams(location.search).get("demo") === "1") {
    loadDemoState();
    document.getElementById("setup").hidden = true;
    document.getElementById("viewer").hidden = false;
    document.getElementById("change-folder").hidden = false;
    setStatus("DEMO MODE", "warn");
    renderFull();
    setInterval(renderTick, RENDER_INTERVAL_MS);
    return;
  }

  if (!("showDirectoryPicker" in window)) {
    showError(t("status_unsupported"));
    return;
  }

  document.getElementById("pick").addEventListener("click", onPickFolder);
  document.getElementById("change-folder").addEventListener("click", onPickFolder);

  const saved = await loadHandleFromIDB();
  if (saved) {
    const perm = await saved.queryPermission({ mode: "read" });
    if (perm === "granted") {
      startWatching(saved);
    } else {
      setStatus(t("status_permission_reauth"), "warn");
      document.getElementById("pick").textContent = t("btn_pick_reauth");
    }
  }

  setInterval(renderTick, RENDER_INTERVAL_MS);
}

function loadDemoState() {
  const now = Date.now();
  state.players = {
    "Lightheals":   { class: "PRIEST",      cooldowns: { 47788:{castAt:now,expiresAt:now}, 33206:{castAt:now-130000,expiresAt:now+50000}, 64843:{castAt:now,expiresAt:now} } },
    "Shadowmend":   { class: "PRIEST",      cooldowns: { 47788:{castAt:now-60000,expiresAt:now+120000}, 33206:{castAt:now,expiresAt:now} } },
    "Naturescure":  { class: "DRUID",       cooldowns: { 102342:{castAt:now,expiresAt:now}, 740:{castAt:now-80000,expiresAt:now+100000}, 20484:{castAt:now,expiresAt:now} } },
    "Sealion":      { class: "PALADIN",     cooldowns: { 6940:{castAt:now-30000,expiresAt:now+90000}, 633:{castAt:now-220000,expiresAt:now+200000}, 31821:{castAt:now,expiresAt:now}, 391054:{castAt:now-200000,expiresAt:now+400000} } },
    "Mistwalker":   { class: "MONK",        cooldowns: { 116849:{castAt:now,expiresAt:now}, 115310:{castAt:now-30000,expiresAt:now+150000} } },
    "Stormwhisper": { class: "SHAMAN",      cooldowns: { 98008:{castAt:now-60000,expiresAt:now+120000}, 32182:{castAt:now,expiresAt:now}, 108280:{castAt:now-90000,expiresAt:now+90000} } },
    "Tidecaller":   { class: "SHAMAN",      cooldowns: { 108280:{castAt:now-30000,expiresAt:now+150000}, 2825:{castAt:now-100000,expiresAt:now+200000} } },
    "Dragonkin":    { class: "EVOKER",      cooldowns: { 363534:{castAt:now-100000,expiresAt:now+140000}, 390386:{castAt:now,expiresAt:now} } },
    "Bladeswarm":   { class: "WARRIOR",     cooldowns: { 97462:{castAt:now,expiresAt:now} } },
    "Ravenfall":    { class: "DEMONHUNTER", cooldowns: { 196718:{castAt:now-60000,expiresAt:now+240000} } },
    "Bonemarch":    { class: "DEATHKNIGHT", cooldowns: { 51052:{castAt:now-30000,expiresAt:now+90000}, 61999:{castAt:now,expiresAt:now} } },
    "Frostmage":    { class: "MAGE",        cooldowns: { 80353:{castAt:now-60000,expiresAt:now+240000} } },
    "Soulbinder":   { class: "WARLOCK",     cooldowns: { 20707:{castAt:now-300000,expiresAt:now+300000} } },
  };
  state.deaths = [
    {
      player: "Holy신부", class: "PRIEST", timestamp: now - 90000,
      damages: [
        { ts: now - 90000, amount: 2847193, source: "Raszageth", spell: "Lightning Breath" },
        { ts: now - 91200, amount: 612400,  source: "Raszageth", spell: "Static Charge" },
        { ts: now - 92500, amount: 488200,  source: "Raszageth", spell: "Static Charge (tick)" },
        { ts: now - 93100, amount: 930100,  source: "Raszageth", spell: "Lightning Strike" },
        { ts: now - 94200, amount: 512800,  source: "Stormling",  spell: "Lightning Bolt" },
      ],
    },
    {
      player: "Frostmage", class: "MAGE", timestamp: now - 30000,
      damages: [
        { ts: now - 30000, amount: 1240000, source: "Raszageth", spell: "Volatile Spark" },
        { ts: now - 31100, amount: 240000,  source: "Raszageth", spell: "Volatile Spark (tick)" },
      ],
    },
    {
      player: "Bonemarch", class: "DEATHKNIGHT", timestamp: now - 5000,
      damages: [],
    },
  ];
  expandedDeaths.add(`${now - 30000}:Frostmage`);
}

function initLangToggle() {
  const btn = document.getElementById("lang-btn");
  const menu = document.getElementById("lang-menu");
  const label = document.getElementById("lang-label");
  const locales = getAvailableLocales();

  function updateLabel() {
    const cur = locales.find(l => l.code === getLocale());
    label.textContent = cur ? cur.name : getLocale();
  }

  for (const loc of locales) {
    const li = document.createElement("li");
    li.dataset.locale = loc.code;
    li.textContent = loc.name;
    li.addEventListener("click", () => {
      setLocale(loc.code);
      updateLabel();
      menu.hidden = true;
      renderFull();
    });
    menu.appendChild(li);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", () => { menu.hidden = true; });

  updateLabel();
}

async function onPickFolder() {
  try {
    const handle = await window.showDirectoryPicker({ id: "wow-logs", mode: "read" });
    await saveHandleToIDB(handle);
    startWatching(handle);
  } catch (e) {
    if (e.name !== "AbortError") {
      console.error(e);
      showError(`${t("status_folder_fail")}: ${e.message}`);
    }
  }
}

// ============================================================
// 파일 감시 루프
// ============================================================
let watchTimer = null;
let currentFileHandle = null;
let readPosition = 0;
let residualBuffer = "";

function startWatching(dirHandle) {
  document.getElementById("setup").hidden = true;
  document.getElementById("viewer").hidden = false;
  document.getElementById("change-folder").hidden = false;

  if (watchTimer) clearInterval(watchTimer);

  currentFileHandle = null;
  readPosition = 0;
  residualBuffer = "";

  setStatus(t("status_folder_connected"), "warn");

  watchTimer = setInterval(() => pollOnce(dirHandle).catch(onPollError), POLL_INTERVAL_MS);
  pollOnce(dirHandle).catch(onPollError);
}

async function pollOnce(dirHandle) {
  const latest = await findLatestLog(dirHandle);

  if (!latest) {
    setStatus(t("status_waiting_log"), "warn");
    return;
  }

  if (!currentFileHandle || currentFileHandle.name !== latest.name) {
    currentFileHandle = latest;
    readPosition = 0;
    residualBuffer = "";
    state.currentFileName = latest.name;
    setStatus(`${t("status_connected")} — ${latest.name}`, "ok");
  }

  const file = await currentFileHandle.getFile();

  if (file.size < readPosition) {
    readPosition = 0;
    residualBuffer = "";
  }
  if (file.size === readPosition) return;

  const chunk = await file.slice(readPosition, file.size).text();
  readPosition = file.size;

  const combined = residualBuffer + chunk;
  const lastNewline = combined.lastIndexOf("\n");
  if (lastNewline < 0) {
    residualBuffer = combined;
    return;
  }

  const complete = combined.slice(0, lastNewline);
  residualBuffer = combined.slice(lastNewline + 1);

  const lines = complete.split("\n");
  let dirty = false;
  for (const line of lines) {
    try {
      const event = parseLine(line);
      if (event && applyEvent(event)) dirty = true;
    } catch (e) {
      console.warn("parse failed:", line, e);
    }
  }
  if (dirty) renderFull();
}

function onPollError(err) {
  console.error("poll error:", err);
  if (err.name === "NotAllowedError") {
    setStatus(t("status_permission_revoked"), "err");
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = null;
    document.getElementById("setup").hidden = false;
    document.getElementById("viewer").hidden = true;
    return;
  }
  setStatus(`${t("status_error")}: ${err.message}`, "err");
}

async function findLatestLog(dirHandle) {
  let latest = null;
  let latestMtime = -1;
  for await (const entry of dirHandle.values()) {
    if (entry.kind !== "file") continue;
    if (!entry.name.startsWith("WoWCombatLog")) continue;
    if (!entry.name.endsWith(".txt")) continue;
    const file = await entry.getFile();
    if (file.lastModified > latestMtime) {
      latestMtime = file.lastModified;
      latest = entry;
    }
  }
  return latest;
}

// ============================================================
// 이벤트 적용
// ============================================================
function applyEvent(event) {
  if (event.type === "encounter_start") {
    state.encounter = { id: event.encounterId, name: event.encounterName, startedAt: event.timestamp };
    state.deaths = [];
    state.damageBuffer = {};
    expandedDeaths.clear();
    return true;
  }
  if (event.type === "encounter_end") {
    state.encounter = null;
    return true;
  }

  if (event.type === "cast" || event.type === "aura") {
    const spell = SpellData[event.spellId];
    if (!spell) return false;
    const player = (state.players[event.player] ??= { class: event.class, cooldowns: {} });
    player.class = event.class;
    player.cooldowns[event.spellId] = {
      castAt: event.timestamp,
      expiresAt: event.timestamp + spell.cooldown * 1000,
    };
    return true;
  }

  if (event.type === "damage") {
    const buf = (state.damageBuffer[event.target] ??= []);
    buf.push({
      ts: event.timestamp,
      amount: event.amount,
      source: event.sourceName || "?",
      spell: event.spellName || "?",
    });
    const cutoff = event.timestamp - DAMAGE_BUFFER_TRIM_MS;
    while (buf.length && buf[0].ts < cutoff) buf.shift();
    return false;
  }

  if (event.type === "death") {
    const buf = state.damageBuffer[event.player] ?? [];
    const cutoff = event.timestamp - DAMAGE_BUFFER_MS;
    const damages = buf
      .filter(d => d.ts >= cutoff)
      .sort((a, b) => b.ts - a.ts);
    const playerInfo = state.players[event.player];
    state.deaths.push({
      player: event.player,
      class: playerInfo?.class ?? null,
      timestamp: event.timestamp,
      damages,
    });
    if (state.deaths.length > DEATH_LIMIT) state.deaths.shift();
    return true;
  }

  return false;
}

// ============================================================
// 렌더링 진입점
// ============================================================
function renderFull() {
  for (const cat of Object.keys(CATEGORY_SECTIONS)) renderGrid(cat);
  updateUtilityCard("heroism");
  updateUtilityCard("battlerez");
  renderDeathLog();
  renderTick();
}

function renderTick() {
  const now = Date.now();
  document.querySelectorAll(".spell-card").forEach(card => {
    const spellId = Number(card.dataset.spellId);
    const spell = SpellData[spellId];
    if (!spell) return;
    const summary = collectSpellSummary(spellId);
    updateSpellCard(card, summary, spell, now);
  });
  updateUtilityCard("heroism");
  updateUtilityCard("battlerez");
}

// ============================================================
// 공통 집계
// ============================================================
function collectSpellSummary(spellId) {
  const now = Date.now();
  const owners = [];
  for (const [name, p] of Object.entries(state.players)) {
    if (p.class !== SpellData[spellId].class) continue;
    const cd = p.cooldowns[spellId];
    if (!cd) {
      owners.push({ player: name, class: p.class, remaining: 0, expiresAt: 0 });
    } else {
      owners.push({
        player: name,
        class: p.class,
        remaining: Math.max(0, cd.expiresAt - now),
        expiresAt: cd.expiresAt,
      });
    }
  }
  const total = owners.length;
  const ready = owners.filter(o => o.remaining === 0).length;
  const positiveRems = owners.filter(o => o.remaining > 0).map(o => o.remaining);
  const minRemaining = positiveRems.length ? Math.min(...positiveRems) : 0;
  return { total, ready, minRemaining, owners };
}

// ============================================================
// 그리드 렌더 (SURVIVAL / RAID_CD)
// ============================================================
function renderGrid(category) {
  const sectionId = CATEGORY_SECTIONS[category];
  const grid = document.querySelector(`#${sectionId} .icon-grid`);

  const visible = CATEGORY_SPELL_ORDER[category].filter(id => collectSpellSummary(id).total > 0);

  const existing = new Map();
  for (const node of grid.children) existing.set(Number(node.dataset.spellId), node);

  const newOrder = [];
  for (const spellId of visible) {
    let card = existing.get(spellId);
    if (!card) card = createSpellCard(spellId);
    newOrder.push(card);
    existing.delete(spellId);
  }
  for (const stale of existing.values()) stale.remove();

  for (let i = 0; i < newOrder.length; i++) {
    if (grid.children[i] !== newOrder[i]) {
      grid.insertBefore(newOrder[i], grid.children[i] ?? null);
    }
  }

  const now = Date.now();
  for (const card of newOrder) {
    const spellId = Number(card.dataset.spellId);
    updateSpellCard(card, collectSpellSummary(spellId), SpellData[spellId], now);
  }
}

function createSpellCard(spellId) {
  const spell = SpellData[spellId];
  const card = document.createElement("div");
  card.className = "spell-card";
  card.dataset.spellId = spellId;

  const icon = document.createElement("div");
  icon.className = "spell-icon";

  const url = iconUrl(spell.iconName);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = spell.name;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      img.remove();
      const abbr = document.createElement("div");
      abbr.className = "abbr";
      abbr.textContent = spell.abbr ?? spell.name.slice(0, 2).toUpperCase();
      icon.prepend(abbr);
    }, { once: true });
    icon.append(img);
  } else {
    const abbr = document.createElement("div");
    abbr.className = "abbr";
    abbr.textContent = spell.abbr ?? spell.name.slice(0, 2).toUpperCase();
    icon.append(abbr);
  }

  const sweep = document.createElement("div");
  sweep.className = "cooldown-sweep";

  const cdText = document.createElement("div");
  cdText.className = "cooldown-text";

  const countBadge = document.createElement("div");
  countBadge.className = "count-badge";

  const readyBadge = document.createElement("div");
  readyBadge.className = "ready-badge";
  readyBadge.style.display = "none";

  icon.append(sweep, cdText, countBadge, readyBadge);

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = spell.name;

  const readyChip = document.createElement("div");
  readyChip.className = "ready-chip";
  readyChip.textContent = "READY";

  card.append(icon, label, readyChip);

  card.addEventListener("mouseenter", () => showTooltip(card, spellId));
  card.addEventListener("mouseleave", hideTooltip);
  card.addEventListener("mousemove", positionTooltip);

  return card;
}

function updateSpellCard(card, summary, spell) {
  const allReady = summary.total > 0 && summary.ready === summary.total;
  const anyReady = summary.ready > 0;
  card.classList.toggle("ready", allReady);
  card.classList.toggle("cooling", !allReady);

  const sweep = card.querySelector(".cooldown-sweep");
  const cdText = card.querySelector(".cooldown-text");
  const countBadge = card.querySelector(".count-badge");
  const readyBadge = card.querySelector(".ready-badge");

  countBadge.textContent = summary.total > 1 ? `×${summary.total}` : "";
  countBadge.style.display = summary.total > 1 ? "" : "none";

  if (allReady) {
    cdText.textContent = "";
    sweep.style.background = "none";
    readyBadge.style.display = "none";
  } else {
    const minRem = summary.minRemaining;
    const total = spell.cooldown * 1000;
    const pct = Math.min(100, (minRem / total) * 100);
    sweep.style.background = `conic-gradient(transparent ${100 - pct}%, rgba(0,0,0,0.7) ${100 - pct}%)`;
    cdText.textContent = formatTime(minRem);
    if (anyReady) {
      readyBadge.textContent = String(summary.ready);
      readyBadge.style.display = "";
    } else {
      readyBadge.style.display = "none";
    }
  }
}

// ============================================================
// 툴팁
// ============================================================
const tooltipEl = () => document.getElementById("tooltip");

function showTooltip(card, spellId) {
  const spell = SpellData[spellId];
  const summary = collectSpellSummary(spellId);
  const tip = tooltipEl();
  tip.replaceChildren();

  const h4 = document.createElement("h4");
  h4.textContent = spell.name;
  tip.append(h4);

  const ul = document.createElement("ul");
  if (summary.owners.length === 0) {
    const li = document.createElement("li");
    li.style.color = "var(--bronze-gray)";
    li.textContent = t("tooltip_no_players");
    ul.append(li);
  } else {
    const sorted = [...summary.owners].sort((a, b) => a.remaining - b.remaining);
    for (const o of sorted) {
      const li = document.createElement("li");
      const left = document.createElement("div");
      left.className = "player-side";
      const dot = document.createElement("span");
      dot.className = "class-dot";
      dot.style.background = CLASS_COLORS[o.class] ?? "#888";
      const name = document.createElement("span");
      name.className = "player-name";
      name.style.color = CLASS_COLORS[o.class] ?? "#888";
      name.textContent = o.player;
      left.append(dot, name);

      const cd = document.createElement("span");
      cd.className = "cd-text";
      if (o.remaining === 0) {
        cd.classList.add("ready");
        cd.textContent = "READY";
      } else {
        cd.textContent = formatTime(o.remaining);
      }
      li.append(left, cd);
      ul.append(li);
    }
  }
  tip.append(ul);
  tip.hidden = false;
}

function positionTooltip(e) {
  const tip = tooltipEl();
  if (tip.hidden) return;
  const margin = 14;
  const rect = tip.getBoundingClientRect();
  let x = e.clientX + margin;
  let y = e.clientY + margin;
  if (x + rect.width > window.innerWidth - 10) x = e.clientX - rect.width - margin;
  if (y + rect.height > window.innerHeight - 10) y = e.clientY - rect.height - margin;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function hideTooltip() {
  tooltipEl().hidden = true;
}

// ============================================================
// 유틸리티 카드 (HEROISM / BATTLEREZ)
// ============================================================
function updateUtilityCard(which) {
  const card = document.getElementById(which);
  if (!card) return;
  const status = card.querySelector(".utility-status");
  const detail = card.querySelector(".utility-detail");

  const category = which === "heroism" ? "HEROISM" : "BATTLEREZ";
  const spellIds = CATEGORY_SPELL_ORDER[category];

  const owners = [];
  for (const id of spellIds) {
    for (const o of collectSpellSummary(id).owners) owners.push(o);
  }

  if (owners.length === 0) {
    card.classList.remove("ready", "cooling", "active");
    card.classList.add("unavailable");
    status.textContent = "—";
    detail.replaceChildren(document.createTextNode(
      which === "heroism" ? t("heroism_no_caster") : t("battlerez_none")
    ));
    if (which === "battlerez") {
      const badge = card.querySelector(".charge-badge");
      if (badge) badge.textContent = "0";
    }
    return;
  }
  card.classList.remove("unavailable");

  if (which === "heroism") {
    const readyOwners = owners.filter(o => o.remaining === 0);
    if (readyOwners.length > 0) {
      card.classList.add("ready");
      card.classList.remove("cooling");
      status.textContent = t("heroism_ready");
      const items = readyOwners.map(playerChip);
      items.push(noteEl(t("heroism_consume_note")));
      detail.replaceChildren(...items);
    } else {
      card.classList.remove("ready");
      card.classList.add("cooling");
      const minRem = Math.min(...owners.map(o => o.remaining));
      status.textContent = t("heroism_cooldown");
      const time = document.createElement("span");
      time.className = "next-time";
      time.textContent = formatTime(minRem);
      detail.replaceChildren(time, noteEl(t("heroism_consume_note")));
    }
  } else {
    const charges = owners.filter(o => o.remaining === 0).length;
    const badge = card.querySelector(".charge-badge");
    if (badge) badge.textContent = String(charges);

    if (charges > 0) {
      card.classList.add("active");
      card.classList.remove("cooling");
      status.textContent = `${charges} ${t("battlerez_charges")}`;
      const cooldownOwners = owners.filter(o => o.remaining > 0);
      if (cooldownOwners.length > 0) {
        const minRem = Math.min(...cooldownOwners.map(o => o.remaining));
        const wrap = document.createElement("span");
        wrap.append(`${t("battlerez_next")} `);
        const time = document.createElement("span");
        time.className = "next-time";
        time.textContent = formatTime(minRem);
        wrap.append(time);
        detail.replaceChildren(wrap);
      } else {
        detail.replaceChildren(document.createTextNode("all available"));
      }
    } else {
      card.classList.add("cooling");
      card.classList.remove("active");
      const minRem = Math.min(...owners.map(o => o.remaining));
      status.textContent = t("heroism_cooldown");
      const wrap = document.createElement("span");
      wrap.append(`${t("battlerez_next")} `);
      const time = document.createElement("span");
      time.className = "next-time";
      time.textContent = formatTime(minRem);
      wrap.append(time);
      detail.replaceChildren(wrap);
    }
  }
}

function playerChip(o) {
  const chip = document.createElement("span");
  chip.className = "player-chip";
  const dot = document.createElement("span");
  dot.className = "class-dot";
  dot.style.background = CLASS_COLORS[o.class] ?? "#888";
  const name = document.createElement("span");
  name.style.color = CLASS_COLORS[o.class] ?? "#888";
  name.textContent = o.player;
  chip.append(dot, name);
  return chip;
}

function noteEl(text) {
  const el = document.createElement("span");
  el.className = "note";
  el.textContent = `· ${text}`;
  return el;
}

// ============================================================
// DEATH LOG
// ============================================================
function renderDeathLog() {
  const list = document.querySelector("#deathlog .death-list");
  const empty = document.querySelector("#deathlog .grid-empty");
  list.replaceChildren();

  if (state.deaths.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const sorted = [...state.deaths].sort((a, b) => a.timestamp - b.timestamp);
  for (const death of sorted) list.append(createDeathRow(death));
}

function deathKey(d) { return `${d.timestamp}:${d.player}`; }

function makeSkullSvg() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "death-skull");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", SKULL_PATH);
  svg.append(path);
  return svg;
}

function createDeathRow(death) {
  const row = document.createElement("div");
  row.className = "death-row";
  const key = deathKey(death);
  if (expandedDeaths.has(key)) row.classList.add("expanded");

  const header = document.createElement("div");
  header.className = "death-header";

  const chevron = document.createElement("span");
  chevron.className = "death-chevron";
  chevron.textContent = "▶";

  const time = document.createElement("span");
  time.className = "death-time";
  time.textContent = new Date(death.timestamp).toLocaleTimeString("ko-KR", { hour12: false });

  const nameWrap = document.createElement("div");
  nameWrap.className = "death-name";
  nameWrap.append(makeSkullSvg());
  const name = document.createElement("span");
  name.textContent = death.player;
  name.style.color = CLASS_COLORS[death.class] ?? "var(--cream)";
  nameWrap.append(name);

  const cause = document.createElement("span");
  cause.className = "death-cause";
  if (death.damages.length > 0) {
    const top = death.damages[0];
    cause.textContent = `${top.spell} · ${formatNumber(top.amount)}`;
  } else {
    cause.textContent = "—";
  }

  header.append(chevron, time, nameWrap, cause);
  header.addEventListener("click", () => {
    if (expandedDeaths.has(key)) expandedDeaths.delete(key);
    else expandedDeaths.add(key);
    row.classList.toggle("expanded");
  });

  const detail = document.createElement("div");
  detail.className = "death-detail";

  const h5 = document.createElement("h5");
  h5.textContent = t("deathlog_damage_taken");
  detail.append(h5);

  if (death.damages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "damage-empty";
    empty.textContent = "—";
    detail.append(empty);
  } else {
    const ul = document.createElement("ul");
    ul.className = "damage-list";
    for (const d of death.damages) {
      const li = document.createElement("li");
      li.className = "damage-row";

      const ts = document.createElement("span");
      ts.className = "ts";
      ts.textContent = new Date(d.ts).toLocaleTimeString("ko-KR", { hour12: false });

      const amt = document.createElement("span");
      amt.className = "amt";
      amt.textContent = `-${formatNumber(d.amount)}`;

      const src = document.createElement("span");
      src.className = "src";
      src.textContent = d.source;

      const spell = document.createElement("span");
      spell.className = "spell";
      spell.textContent = d.spell;

      li.append(ts, amt, src, spell);
      ul.append(li);
    }
    detail.append(ul);
  }

  row.append(header, detail);
  return row;
}

// ============================================================
// 유틸
// ============================================================
function formatTime(remainingMs) {
  const totalSec = Math.ceil(remainingMs / 1000);
  if (totalSec < 60) return `${totalSec}`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("en-US");
}

function setStatus(text, kind = "idle") {
  const el = document.getElementById("status");
  const txtEl = document.getElementById("status-text");
  txtEl.textContent = text;
  el.className = `status-pill status-${kind}`;
}

function showError(msg) {
  setStatus(msg, "err");
}

// ============================================================
// IndexedDB
// ============================================================
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandleToIDB(handle) {
  const db = await openIDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadHandleFromIDB() {
  const db = await openIDB();
  const handle = await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}

main().catch(e => {
  console.error(e);
  showError(`${t("status_init_fail")}: ${e.message}`);
});
