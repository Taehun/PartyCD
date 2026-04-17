const translations = {
  ko: {
    title: "PartyCD Viewer",
    subtitle: "공대 생존기 추적",
    status_idle: "대기 중",
    status_connected: "연결됨",
    status_searching: "로그 파일 찾는 중",
    status_waiting_log: "대기 중 — WoW에서 /combatlog 을 켜주세요",
    status_folder_connected: "폴더 연결됨 — 로그 파일 찾는 중",
    status_permission_revoked: "권한이 철회되었습니다 — 폴더를 다시 선택하세요",
    status_permission_reauth: "권한 재승인 필요 — 폴더 다시 선택",
    status_error: "오류",
    status_unsupported: "이 브라우저는 File System Access API를 지원하지 않습니다. Chrome/Edge/Arc 같은 Chromium 기반 브라우저를 사용하세요.",
    status_init_fail: "초기화 실패",
    status_folder_fail: "폴더 선택 실패",
    status_recovering: "일시 오류 — 재시도 중",

    btn_pick: "WoW Logs 폴더 선택",
    btn_pick_reauth: "폴더 다시 선택 (재승인)",
    btn_change_folder: "폴더 변경",
    btn_overlay: "오버레이 모드",
    btn_dashboard: "대시보드로 복귀",

    overlay_label_survival: "외생기",
    overlay_label_raidcd: "공대 생존기",
    overlay_label_battlerez: "전투 부활",

    setup_title: "시작하기",
    setup_step1: "WoW에서 /combatlog 을 입력하여 전투 로그를 켭니다.",
    setup_step2: "아래 버튼을 눌러 World of Warcraft/_retail_/Logs 폴더를 선택합니다.",
    setup_step3: "파티원이 추적 스펠을 시전하면 자동으로 표시됩니다.",
    setup_hint: "Chrome / Edge / Arc 등 Chromium 기반 브라우저만 지원합니다.",

    section_survival: "생존기",
    section_raidcd: "공대 쿨",
    section_heroism: "영웅심",
    section_battlerez: "전투 부활",
    section_deathlog: "사망 로그",

    deathlog_clear_note: "전투 시작 시 초기화",
    deathlog_damage_taken: "받은 피해 — 마지막 10초",
    deathlog_empty: "사망 기록 없음",

    heroism_ready: "사용 가능",
    heroism_cooldown: "다음 사용까지",
    heroism_no_caster: "공대에 영웅심 시전자가 없습니다",
    heroism_consume_note: "한 명이 시전하면 모두 소모됨",

    battlerez_charges: "차지",
    battlerez_next: "다음 차지",
    battlerez_none: "공대에 전투부활 시전자가 없습니다",

    grid_empty: "감지된 스펠 없음",
    ready: "READY",

    tooltip_no_players: "보유 플레이어 없음",
  },
  en: {
    title: "PartyCD Viewer",
    subtitle: "Raid CD Tracker",
    status_idle: "Idle",
    status_connected: "Connected",
    status_searching: "Searching for log file",
    status_waiting_log: "Waiting — enable /combatlog in WoW",
    status_folder_connected: "Folder connected — searching for log file",
    status_permission_revoked: "Permission revoked — please reselect folder",
    status_permission_reauth: "Permission needed — reselect folder",
    status_error: "Error",
    status_unsupported: "This browser does not support the File System Access API. Please use a Chromium-based browser (Chrome, Edge, Arc).",
    status_init_fail: "Initialization failed",
    status_folder_fail: "Folder selection failed",
    status_recovering: "Transient error — retrying",

    btn_pick: "Select WoW Logs Folder",
    btn_pick_reauth: "Reselect Folder (Reauthorize)",
    btn_change_folder: "Change Folder",
    btn_overlay: "Overlay mode",
    btn_dashboard: "Back to dashboard",

    overlay_label_survival: "External CDs",
    overlay_label_raidcd: "Raid CDs",
    overlay_label_battlerez: "Battle Rez",

    setup_title: "Get Started",
    setup_step1: "Type /combatlog in WoW to enable combat logging.",
    setup_step2: "Click the button below to select your World of Warcraft/_retail_/Logs folder.",
    setup_step3: "Tracked spells will appear automatically when raid members cast them.",
    setup_hint: "Only Chromium-based browsers are supported (Chrome, Edge, Arc).",

    section_survival: "SURVIVAL",
    section_raidcd: "RAID CD",
    section_heroism: "HEROISM",
    section_battlerez: "BATTLE REZ",
    section_deathlog: "DEATH LOG",

    deathlog_clear_note: "cleared on encounter start",
    deathlog_damage_taken: "DAMAGE TAKEN — last 10 seconds",
    deathlog_empty: "no deaths recorded",

    heroism_ready: "READY",
    heroism_cooldown: "NEXT",
    heroism_no_caster: "no heroism caster in raid",
    heroism_consume_note: "any one will consume all",

    battlerez_charges: "charges",
    battlerez_next: "next charge",
    battlerez_none: "no battle rez caster in raid",

    grid_empty: "no spells detected",
    ready: "READY",

    tooltip_no_players: "no players",
  },
};

const LOCALE_NAMES = {
  ko: "한국어",
  en: "English",
};

const STORAGE_KEY = "partycd-locale";
let currentLocale = "ko";

export function getAvailableLocales() {
  return Object.entries(LOCALE_NAMES).map(([code, name]) => ({ code, name }));
}

export function detectLocale() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && translations[saved]) return saved;
  const lang = (navigator.language ?? "ko").slice(0, 2);
  return translations[lang] ? lang : "en";
}

export function setLocale(locale) {
  currentLocale = translations[locale] ? locale : "en";
  localStorage.setItem(STORAGE_KEY, currentLocale);
  document.documentElement.lang = currentLocale;
  applyStaticTranslations();
  return currentLocale;
}

export function getLocale() {
  return currentLocale;
}

export function t(key) {
  return translations[currentLocale]?.[key] ?? translations.en[key] ?? key;
}

export function applyStaticTranslations() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  }
}
