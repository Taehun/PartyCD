import { parseLine } from "./parser.js";
import { SpellData, CLASS_COLORS, iconUrl, localizedSpellName } from "./spells.js";
import { t, setLocale, getLocale, detectLocale, getAvailableLocales } from "./i18n.js";

// ============================================================
// 상수
// ============================================================
const POLL_INTERVAL_MS = 500;
const RENDER_INTERVAL_MS = 100;
const DAMAGE_BUFFER_MS = 10_000;        // 사망 직전 N ms 데미지 보존
const DAMAGE_BUFFER_TRIM_MS = 30_000;   // 메모리 보호용 cutoff
const DEATH_LIMIT = 30;

// Windows + File System Access API transient 에러 허용치.
// 로그 롤오버 / WoW flush 시점의 파일 락 / AV 실시간 검사 등으로 간헐적 NotReadableError가 날 수 있음.
const TRANSIENT_WARN_THRESHOLD = 5;    // 연속 ~2.5s까진 무음
const TRANSIENT_ALERT_THRESHOLD = 10;  // 연속 ~5s 넘으면 err로 표시
const IDB_NAME = "partycd-viewer";
const IDB_STORE = "handles";
const IDB_KEY = "logs-dir";
const OVERLAY_STORAGE_KEY = "partycd-overlay";

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
  initOverlayToggle();

  if (new URLSearchParams(location.search).get("demo") === "1") {
    loadDemoState();
    document.getElementById("setup").hidden = true;
    document.getElementById("viewer").hidden = false;
    document.getElementById("change-folder").hidden = false;
    document.getElementById("overlay-toggle").hidden = false;
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
let consecutiveErrors = 0;

function startWatching(dirHandle) {
  document.getElementById("setup").hidden = true;
  document.getElementById("viewer").hidden = false;
  document.getElementById("change-folder").hidden = false;
  document.getElementById("overlay-toggle").hidden = false;

  if (watchTimer) clearInterval(watchTimer);

  currentFileHandle = null;
  readPosition = 0;
  residualBuffer = "";
  consecutiveErrors = 0;

  setStatus(t("status_folder_connected"), "warn");

  const tick = () => pollOnce(dirHandle).then(onPollSuccess).catch(onPollError);
  watchTimer = setInterval(tick, POLL_INTERVAL_MS);
  tick();
}

function onPollSuccess() {
  if (consecutiveErrors === 0) return;
  consecutiveErrors = 0;
  // 연결 상태 복원 — 파일이 잡혀 있으면 파일명까지 표시.
  if (currentFileHandle) {
    setStatus(`${t("status_connected")} — ${currentFileHandle.name}`, "ok");
  }
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

  const lines = complete.split(/\r?\n/);
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
  // 명시적 권한 철회는 즉시 hard-fail — 재인증 유도.
  if (err.name === "NotAllowedError") {
    console.error("poll permission revoked:", err);
    setStatus(t("status_permission_revoked"), "err");
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = null;
    document.getElementById("setup").hidden = false;
    document.getElementById("viewer").hidden = true;
    return;
  }

  // 그 외(NotReadableError/NotFoundError/AbortError 등)는 대체로 transient.
  // WoW flush 락 경합, 로그 롤오버, AV 실시간 검사 등으로 간헐적으로 터짐 → 조용히 재시도.
  consecutiveErrors += 1;

  if (consecutiveErrors < TRANSIENT_WARN_THRESHOLD) {
    // 무음 — 다음 tick에서 복구될 가능성 높음.
    if (consecutiveErrors === 1) console.debug("poll transient:", err.name, err.message);
    return;
  }

  if (consecutiveErrors < TRANSIENT_ALERT_THRESHOLD) {
    setStatus(`${t("status_recovering")} · ${consecutiveErrors}`, "warn");
    return;
  }

  // 지속적 실패 — 실제 문제로 간주.
  console.error(`poll error persistent (${consecutiveErrors} consecutive):`, err);
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
      overkill: event.overkill ?? 0,
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
    // 킬링 블로우: overkill > 0 이벤트가 있으면 cause로 우선 (없으면 가장 최근 데미지).
    const killingBlow = damages.find(d => d.overkill > 0) ?? damages[0] ?? null;
    const playerInfo = state.players[event.player];
    state.deaths.push({
      player: event.player,
      class: playerInfo?.class ?? null,
      timestamp: event.timestamp,
      damages,
      killingBlow,
    });
    state.deaths.sort((a, b) => a.timestamp - b.timestamp);
    while (state.deaths.length > DEATH_LIMIT) state.deaths.shift();
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
  renderOverlay();
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
  if (document.body.classList.contains("overlay-mode")) {
    const now2 = Date.now();
    document.querySelectorAll(".overlay-instance").forEach(node => {
      const spellId = Number(node.dataset.spellId);
      const playerName = node.dataset.player;
      const player = state.players[playerName];
      if (!player) return;
      updateOverlayInstance(node, spellId, playerName, player, now2);
    });
  }
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

  const displayName = localizedSpellName(spell, getLocale());

  const icon = document.createElement("div");
  icon.className = "spell-icon";

  const url = iconUrl(spell.iconName);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = displayName;
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
  label.textContent = displayName;

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

  // 로케일 변경 시 라벨/alt 재적용
  const displayName = localizedSpellName(spell, getLocale());
  const label = card.querySelector(".label");
  if (label && label.textContent !== displayName) label.textContent = displayName;
  const img = card.querySelector("img");
  if (img && img.alt !== displayName) img.alt = displayName;

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
  h4.textContent = localizedSpellName(spell, getLocale());
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
  const blow = death.killingBlow ?? death.damages[0];
  if (blow) {
    cause.textContent = `${blow.spell} · ${formatNumber(blow.amount)}`;
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
// Overlay mode (omniCD 스타일 플레이어 중심 view)
// ============================================================
function initOverlayToggle() {
  const toggleBtn = document.getElementById("overlay-toggle");
  const exitBtn = document.getElementById("overlay-exit");
  toggleBtn.addEventListener("click", () => setOverlayMode(true));
  exitBtn.addEventListener("click", () => setOverlayMode(false));

  const saved = localStorage.getItem(OVERLAY_STORAGE_KEY) === "1";
  if (saved) setOverlayMode(true, { skipSave: true });
}

function setOverlayMode(on, { skipSave } = {}) {
  document.body.classList.toggle("overlay-mode", on);
  if (!skipSave) localStorage.setItem(OVERLAY_STORAGE_KEY, on ? "1" : "0");
  if (on) renderOverlay();
}

// 오버레이에 표시할 카테고리. HEROISM은 1회성이라 제외.
const OVERLAY_CATEGORIES = [
  { key: "SURVIVAL",  cssMod: "survival",  labelKey: "overlay_label_survival" },
  { key: "RAID_CD",   cssMod: "raidcd",    labelKey: "overlay_label_raidcd" },
  { key: "BATTLEREZ", cssMod: "battlerez", labelKey: "overlay_label_battlerez" },
];

function renderOverlay() {
  const container = document.getElementById("overlay-view");
  if (!container) return;

  // 섹션은 고정 순서로 3개. 없으면 생성, 있으면 재사용.
  const existingSections = new Map();
  for (const node of container.children) existingSections.set(node.dataset.category, node);

  const orderedSections = [];
  for (const cat of OVERLAY_CATEGORIES) {
    let section = existingSections.get(cat.key);
    if (!section) section = createOverlaySection(cat);
    else updateOverlaySectionLabel(section, cat);
    orderedSections.push(section);
    existingSections.delete(cat.key);
  }
  for (const stale of existingSections.values()) stale.remove();

  for (let i = 0; i < orderedSections.length; i++) {
    if (container.children[i] !== orderedSections[i]) {
      container.insertBefore(orderedSections[i], container.children[i] ?? null);
    }
  }

  for (const section of orderedSections) {
    updateOverlaySectionInstances(section);
  }
}

function createOverlaySection(cat) {
  const section = document.createElement("div");
  section.className = `overlay-section overlay-section--${cat.cssMod}`;
  section.dataset.category = cat.key;

  const title = document.createElement("div");
  title.className = "overlay-section-title";
  title.dataset.i18n = cat.labelKey;
  title.textContent = t(cat.labelKey);

  const instances = document.createElement("div");
  instances.className = "overlay-instances";

  section.append(title, instances);
  return section;
}

function updateOverlaySectionLabel(section, cat) {
  const title = section.querySelector(".overlay-section-title");
  if (title) title.textContent = t(cat.labelKey);
}

// 섹션의 인스턴스(player-spell 페어) 아이콘을 갱신. 고정 순서: 스펠 ID → 플레이어 이름.
function updateOverlaySectionInstances(section) {
  const category = section.dataset.category;
  const instancesEl = section.querySelector(".overlay-instances");

  // 이 카테고리에 속한 스펠 × 그 스펠을 시전한 플레이어 조합을 전부 열거.
  const pairs = [];
  for (const spellId of CATEGORY_SPELL_ORDER[category]) {
    for (const [playerName, p] of Object.entries(state.players)) {
      if (p.class !== SpellData[spellId].class) continue;
      if (p.cooldowns[spellId] === undefined) continue;
      pairs.push({ spellId, playerName, player: p });
    }
  }
  // 정렬: 스펠 카테고리 순서(이미 CATEGORY_SPELL_ORDER로 확정) → 플레이어 이름
  pairs.sort((a, b) => {
    if (a.spellId !== b.spellId) {
      return CATEGORY_SPELL_ORDER[category].indexOf(a.spellId) - CATEGORY_SPELL_ORDER[category].indexOf(b.spellId);
    }
    return a.playerName.localeCompare(b.playerName);
  });

  const existing = new Map();
  for (const node of instancesEl.children) existing.set(node.dataset.key, node);

  const ordered = [];
  for (const { spellId, playerName, player } of pairs) {
    const key = `${playerName}:${spellId}`;
    let node = existing.get(key);
    if (!node) node = createOverlayInstance(spellId, playerName, player);
    ordered.push({ node, spellId, playerName, player });
    existing.delete(key);
  }
  for (const stale of existing.values()) stale.remove();

  for (let i = 0; i < ordered.length; i++) {
    if (instancesEl.children[i] !== ordered[i].node) {
      instancesEl.insertBefore(ordered[i].node, instancesEl.children[i] ?? null);
    }
  }

  const now = Date.now();
  for (const entry of ordered) {
    updateOverlayInstance(entry.node, entry.spellId, entry.playerName, entry.player, now);
  }
}

function createOverlayInstance(spellId, playerName, player) {
  const spell = SpellData[spellId];
  const node = document.createElement("div");
  node.className = "overlay-instance";
  node.dataset.spellId = spellId;
  node.dataset.player = playerName;
  node.dataset.key = `${playerName}:${spellId}`;

  const classColor = CLASS_COLORS[player.class] ?? "#888";
  node.style.borderColor = classColor;
  node.style.color = classColor;

  const displayName = localizedSpellName(spell, getLocale());

  const url = iconUrl(spell.iconName);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = `${displayName} — ${playerName}`;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      img.remove();
      const abbr = document.createElement("div");
      abbr.className = "abbr";
      abbr.textContent = spell.abbr ?? spell.name.slice(0, 2).toUpperCase();
      node.prepend(abbr);
    }, { once: true });
    node.append(img);
  } else {
    const abbr = document.createElement("div");
    abbr.className = "abbr";
    abbr.textContent = spell.abbr ?? spell.name.slice(0, 2).toUpperCase();
    node.append(abbr);
  }

  const sweep = document.createElement("div");
  sweep.className = "cooldown-sweep";
  const cdText = document.createElement("div");
  cdText.className = "cooldown-text";
  node.append(sweep, cdText);

  // 호버 툴팁: 이 스펠의 집계된 전체 소유자 목록을 그대로 보여줌.
  node.addEventListener("mouseenter", () => showTooltip(node, spellId));
  node.addEventListener("mouseleave", hideTooltip);
  node.addEventListener("mousemove", positionTooltip);
  return node;
}

function updateOverlayInstance(node, spellId, playerName, player, now) {
  const spell = SpellData[spellId];
  const cd = player.cooldowns[spellId];
  if (!cd) return;

  const remaining = Math.max(0, cd.expiresAt - now);
  const ready = remaining === 0;
  node.classList.toggle("ready", ready);
  node.classList.toggle("cooling", !ready);

  // 클래스 색 borderColor는 플레이어 식별용, READY glow는 currentColor 기반이라 자연스럽게 빛남.
  const classColor = CLASS_COLORS[player.class] ?? "#888";
  if (node.style.borderColor !== classColor) {
    node.style.borderColor = classColor;
    node.style.color = classColor;
  }

  const displayName = localizedSpellName(spell, getLocale());
  const img = node.querySelector("img");
  const expectedAlt = `${displayName} — ${playerName}`;
  if (img && img.alt !== expectedAlt) img.alt = expectedAlt;

  const sweep = node.querySelector(".cooldown-sweep");
  const cdText = node.querySelector(".cooldown-text");

  if (ready) {
    cdText.textContent = "";
    sweep.style.background = "none";
  } else {
    const total = spell.cooldown * 1000;
    const pct = Math.min(100, (remaining / total) * 100);
    sweep.style.background = `conic-gradient(transparent ${100 - pct}%, rgba(0,0,0,0.75) ${100 - pct}%)`;
    cdText.textContent = formatTime(remaining);
  }
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
