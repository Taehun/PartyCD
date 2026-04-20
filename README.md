# RaidCD

WoW 공격대 쿨다운 실시간 뷰어 — 전투 로그 파일을 브라우저에서 직접 읽어 공대 생존기/레이드 CD/영웅심/전투 부활 상태를 OmniCD 스타일 대시보드로 표시합니다.

> 📺 **라이브 뷰어**: [https://taehun.github.io/RaidCD/](https://taehun.github.io/RaidCD/)

## 특징

- **인게임 애드온 불필요** — WoW 기본 `/combatlog` 로그 파일만 있으면 동작
- **12.0.0+ Secret Values 우회** — 보스전/M+/PvP에서 타 플레이어 시전 정보가 제한되는 제약을 로그 기반으로 해결
- **WoW UI 테마** — dark slate + gold/bronze 인게임 분위기
- **한국어/영어 지원**
- **Chromium 전용** (File System Access API 사용)

## 추적 대상

| 카테고리 | 내용 |
|---|---|
| **SURVIVAL** | Guardian Spirit · Pain Suppression · Ironbark · Blessing of Sacrifice · Lay on Hands · Life Cocoon · Spirit Link Totem · Ancestral Protection Totem · Rewind |
| **RAID CD** | Tranquility · Rallying Cry · Anti-Magic Zone · Darkness · Aura Mastery · Revival · Barrier · Divine Hymn |
| **HEROISM** | Heroism · Bloodlust · Time Warp · Primal Rage · Drums of Fury |
| **BATTLE REZ** | Rebirth · Soulstone · Intercession · Absolution |

각 카테고리는 스펠당 1아이콘으로 표시되며, 우상단 `×N` 배지로 공대 보유 수, 우하단 녹색 배지로 준비된 수를 보여줍니다. 호버 시 보유 플레이어별 개별 쿨다운 툴팁.

추가로 **DEATH LOG** — 공대원 사망 기록 + 사망 직전 10초 데미지 원인.

## 사용법

1. 게임에서 `/combatlog` 활성화
2. [뷰어](https://taehun.github.io/RaidCD/) 접속 → "WoW Logs 폴더 선택" 클릭
3. WoW Logs 폴더 지정:
   - macOS: `~/Library/Application Support/com.blizzard.worldofwarcraft/_retail_/Logs`
   - Windows: `World of Warcraft\_retail_\Logs`
4. 권한 허용

폴더 권한은 IndexedDB에 캐시되어 재방문 시 "재승인" 버튼만 누르면 복구됩니다.

## 제약

- **Chromium 계열만 지원** (Chrome, Edge, Arc, Brave, Whale). Firefox/Safari는 File System Access API 미지원.
- **같은 PC의 브라우저 창에서만** 동작 (휴대폰/OBS/원격 불가).
- 로그 플러시 지연으로 수백 ms ~ 수 초 지연 존재.

## 로컬 개발

```bash
npx serve .     # 또는 python3 -m http.server 8000
```

`file://` 경로에서는 File System Access API가 제한되므로 HTTP 컨텍스트 필수.

### 테스트

```bash
npm test
```

## 라이선스

MIT
