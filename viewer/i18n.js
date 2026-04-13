const translations = {
  ko: {
    title: "PartyCD Viewer",
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

    btn_pick: "WoW Logs 폴더 선택",
    btn_pick_reauth: "폴더 다시 선택 (재승인)",
    btn_change_folder: "폴더 변경",

    setup_title: "시작하기",
    setup_step1: "WoW에서 /combatlog 을 입력하여 전투 로그를 켭니다.",
    setup_step2: "아래 버튼을 눌러 World of Warcraft/_retail_/Logs 폴더를 선택합니다.",
    setup_step3: "파티원이 추적 스펠을 시전하면 자동으로 바가 등장합니다.",
    setup_hint: "Chrome / Edge / Arc 등 Chromium 기반 브라우저만 지원합니다.",

    section_survival: "외부 생존기",
    section_raidcd: "공대 쿨",
    section_heroism: "영웅심",
    section_battlerez: "전투 부활",
    section_history: "최근 캐스트",

    empty: "아직 감지된 캐스트가 없습니다.",
    ready: "READY",

    kind_cast: "시전",
    kind_aura: "버프",
    kind_interrupt: "끊음",
  },
  en: {
    title: "PartyCD Viewer",
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

    btn_pick: "Select WoW Logs Folder",
    btn_pick_reauth: "Reselect Folder (Reauthorize)",
    btn_change_folder: "Change Folder",

    setup_title: "Get Started",
    setup_step1: "Type /combatlog in WoW to enable combat logging.",
    setup_step2: "Click the button below to select your World of Warcraft/_retail_/Logs folder.",
    setup_step3: "Bars will appear automatically when party members cast tracked spells.",
    setup_hint: "Only Chromium-based browsers are supported (Chrome, Edge, Arc).",

    section_survival: "External CDs",
    section_raidcd: "Raid CDs",
    section_heroism: "Heroism",
    section_battlerez: "Battle Rez",
    section_history: "Recent Casts",

    empty: "No casts detected yet.",
    ready: "READY",

    kind_cast: "Cast",
    kind_aura: "Buff",
    kind_interrupt: "Interrupted",
  },
};

let currentLocale = "ko";

export function detectLocale() {
  const lang = (navigator.language ?? "ko").slice(0, 2);
  return lang === "ko" ? "ko" : "en";
}

export function setLocale(locale) {
  currentLocale = translations[locale] ? locale : "en";
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
