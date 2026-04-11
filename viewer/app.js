import { parseLine } from "./parser.js";
import { SpellData, CLASS_COLORS } from "./spells.js";

// ============================================================
// 상수
// ============================================================
const POLL_INTERVAL_MS = 500;
const RENDER_INTERVAL_MS = 100;
const HISTORY_LIMIT = 30;
const IDB_NAME = "partycd-viewer";
const IDB_STORE = "handles";
const IDB_KEY = "logs-dir";

// ============================================================
// 상태
// ============================================================
const state = {
  players: {},       // { [playerName]: { class, cooldowns: { [spellId]: { castAt, expiresAt } } } }
  history: [],       // { timestamp, player, class, spellId, spellName, type }[]
  currentFileName: null,
};

const barNodes = new Map(); // "player:spellId" → HTMLElement, DOM 재사용

// ============================================================
// 엔트리
// ============================================================
async function main() {
  if (!("showDirectoryPicker" in window)) {
    showError("이 브라우저는 File System Access API를 지원하지 않습니다. Chrome/Edge/Arc 같은 Chromium 기반 브라우저를 사용하세요.");
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
      setStatus("권한 재승인 필요 — 폴더 다시 선택", "warn");
      document.getElementById("pick").textContent = "폴더 다시 선택 (재승인)";
    }
  }

  setInterval(renderTick, RENDER_INTERVAL_MS);
}

async function onPickFolder() {
  try {
    const handle = await window.showDirectoryPicker({ id: "wow-logs", mode: "read" });
    await saveHandleToIDB(handle);
    startWatching(handle);
  } catch (e) {
    if (e.name !== "AbortError") {
      console.error(e);
      showError(`폴더 선택 실패: ${e.message}`);
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

  setStatus("폴더 연결됨 — 로그 파일 찾는 중", "warn");

  watchTimer = setInterval(() => pollOnce(dirHandle).catch(onPollError), POLL_INTERVAL_MS);
  pollOnce(dirHandle).catch(onPollError);
}

async function pollOnce(dirHandle) {
  const latest = await findLatestLog(dirHandle);

  if (!latest) {
    setStatus("대기 중 — WoW에서 /combatlog 을 켜주세요", "warn");
    return;
  }

  if (!currentFileHandle || currentFileHandle.name !== latest.name) {
    currentFileHandle = latest;
    readPosition = 0;
    residualBuffer = "";
    state.currentFileName = latest.name;
    setStatus(`연결됨 — ${latest.name}`, "ok");
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
  let applied = 0;
  for (const line of lines) {
    try {
      const event = parseLine(line);
      if (event) {
        applyEvent(event);
        applied++;
      }
    } catch (e) {
      console.warn("parse failed:", line, e);
    }
  }

  if (applied > 0) renderFull();
}

function onPollError(err) {
  console.error("poll error:", err);
  if (err.name === "NotAllowedError") {
    setStatus("권한이 철회되었습니다 — 폴더를 다시 선택하세요", "err");
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = null;
    document.getElementById("setup").hidden = false;
    document.getElementById("viewer").hidden = true;
    return;
  }
  setStatus(`오류: ${err.message}`, "err");
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
  const spell = SpellData[event.spellId];
  if (!spell) return;

  if (event.type === "cast" || event.type === "aura") {
    const player = (state.players[event.player] ??= {
      class: event.class,
      cooldowns: {},
    });
    player.class = event.class;
    player.cooldowns[event.spellId] = {
      castAt: event.timestamp,
      expiresAt: event.timestamp + spell.cooldown * 1000,
    };

    state.history.unshift({
      timestamp: event.timestamp,
      player: event.player,
      class: event.class,
      spellId: event.spellId,
      spellName: spell.name,
      type: event.type,
    });
  } else if (event.type === "interrupt") {
    state.history.unshift({
      timestamp: event.timestamp,
      player: event.player,
      class: event.class,
      spellId: event.spellId,
      spellName: spell.name,
      type: "interrupt",
      targetSpellName: event.targetSpellName,
    });
  }

  if (state.history.length > HISTORY_LIMIT) {
    state.history.length = HISTORY_LIMIT;
  }
}

// ============================================================
// 렌더링
// ============================================================
function renderFull() {
  renderCategory("SURVIVAL");
  renderCategory("INTERRUPT");
  renderHistory();
  renderTick();
}

function collectEntries(category) {
  const now = Date.now();
  const entries = [];
  for (const [playerName, player] of Object.entries(state.players)) {
    for (const spellIdStr of Object.keys(player.cooldowns)) {
      const spellId = Number(spellIdStr);
      const spell = SpellData[spellId];
      if (!spell || spell.category !== category) continue;
      const cd = player.cooldowns[spellId];
      const remaining = Math.max(0, cd.expiresAt - now);
      entries.push({
        key: `${playerName}:${spellId}`,
        playerName,
        playerClass: player.class,
        spellId,
        spell,
        castAt: cd.castAt,
        expiresAt: cd.expiresAt,
        remaining,
      });
    }
  }
  entries.sort((a, b) => {
    const aReady = a.remaining === 0;
    const bReady = b.remaining === 0;
    if (aReady !== bReady) return aReady ? -1 : 1;
    if (a.remaining !== b.remaining) return a.remaining - b.remaining;
    return a.playerName.localeCompare(b.playerName);
  });
  return entries;
}

function renderCategory(category) {
  const sectionId = category === "SURVIVAL" ? "survival" : "interrupt";
  const container = document.querySelector(`#${sectionId} .bars`);
  const entries = collectEntries(category);

  const currentKeys = new Set(entries.map(e => e.key));
  for (const [key, node] of barNodes) {
    if (node.dataset.category === category && !currentKeys.has(key)) {
      node.remove();
      barNodes.delete(key);
    }
  }

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    let node = barNodes.get(e.key);
    if (!node) {
      node = createBarNode(e, category);
      barNodes.set(e.key, node);
    }
    if (container.children[i] !== node) {
      container.insertBefore(node, container.children[i] ?? null);
    }
    updateBarNode(node, e);
  }

  document.querySelector(`#${sectionId} .empty`).hidden = entries.length > 0;
}

function createBarNode(e, category) {
  const div = document.createElement("div");
  div.className = "bar";
  div.dataset.category = category;
  const color = CLASS_COLORS[e.playerClass] ?? "#888";
  div.style.borderLeftColor = color;

  const icon = document.createElement("div");
  icon.className = "icon";
  icon.style.color = color;
  icon.textContent = e.spell.name.slice(0, 2);

  const meta = document.createElement("div");
  meta.className = "meta";
  const playerEl = document.createElement("div");
  playerEl.className = "player";
  playerEl.style.color = color;
  playerEl.textContent = e.playerName;
  const spellEl = document.createElement("div");
  spellEl.className = "spell";
  spellEl.textContent = e.spell.name;
  meta.append(playerEl, spellEl);

  const time = document.createElement("div");
  time.className = "time";

  const fill = document.createElement("div");
  fill.className = "fill";

  div.append(icon, meta, time, fill);
  return div;
}

function updateBarNode(node, e) {
  const ready = e.remaining === 0;
  node.classList.toggle("ready", ready);
  node.classList.toggle("cooling", !ready);
  const timeEl = node.querySelector(".time");
  timeEl.textContent = ready ? "READY" : formatTime(e.remaining);
  const totalMs = e.spell.cooldown * 1000;
  const pct = ready ? 0 : (e.remaining / totalMs) * 100;
  node.querySelector(".fill").style.width = `${pct}%`;
}

function renderTick() {
  const now = Date.now();
  let needsResort = false;
  for (const [key, node] of barNodes) {
    const [playerName, spellIdStr] = key.split(":");
    const player = state.players[playerName];
    if (!player) continue;
    const spellId = Number(spellIdStr);
    const cd = player.cooldowns[spellId];
    if (!cd) continue;
    const spell = SpellData[spellId];
    const remaining = Math.max(0, cd.expiresAt - now);
    const wasReady = node.classList.contains("ready");
    const nowReady = remaining === 0;
    if (wasReady !== nowReady) needsResort = true;

    node.querySelector(".time").textContent = nowReady ? "READY" : formatTime(remaining);
    node.classList.toggle("ready", nowReady);
    node.classList.toggle("cooling", !nowReady);
    const totalMs = spell.cooldown * 1000;
    const pct = nowReady ? 0 : (remaining / totalMs) * 100;
    node.querySelector(".fill").style.width = `${pct}%`;
  }
  if (needsResort) {
    renderCategory("SURVIVAL");
    renderCategory("INTERRUPT");
  }
}

function renderHistory() {
  const ul = document.querySelector("#history ul");
  while (ul.firstChild) ul.removeChild(ul.firstChild);

  for (const h of state.history) {
    const li = document.createElement("li");
    const color = CLASS_COLORS[h.class] ?? "#888";
    const time = new Date(h.timestamp).toLocaleTimeString("ko-KR", { hour12: false });

    const timeEl = document.createElement("span");
    timeEl.className = "hist-time";
    timeEl.textContent = time;

    const playerEl = document.createElement("span");
    playerEl.className = "hist-player";
    playerEl.style.color = color;
    playerEl.textContent = h.player;

    const spellEl = document.createElement("span");
    spellEl.className = "hist-spell";
    spellEl.textContent = h.spellName;

    const kindEl = document.createElement("span");
    kindEl.className = "hist-kind";
    const kindLabel = h.type === "interrupt"
      ? `끊음: ${h.targetSpellName ?? "?"}`
      : h.type === "aura" ? "버프" : "시전";
    kindEl.textContent = kindLabel;

    li.append(timeEl, playerEl, spellEl, kindEl);
    ul.appendChild(li);
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

function setStatus(text, kind = "idle") {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = `status-${kind}`;
}

function showError(msg) {
  setStatus(msg, "err");
}

// ============================================================
// IndexedDB — directory handle 영속화
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

// ============================================================
main().catch(e => {
  console.error(e);
  showError(`초기화 실패: ${e.message}`);
});
