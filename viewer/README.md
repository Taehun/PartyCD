# PartyCD Viewer

WoW 전투 로그 파일을 브라우저에서 직접 읽어 파티 쿨다운을 실시간 표시하는 정적 웹 뷰어. PartyCD 애드온의 보조 도구로, WoW 12.0 Secret Values 제약을 우회한다.

## 요구사항

- **Chromium 기반 브라우저** (Chrome, Edge, Arc, Brave, Whale 등). Firefox/Safari는 File System Access API 미지원으로 동작하지 않는다.
- WoW 게임 내에서 `/combatlog` 을 켜서 전투 로그 파일 생성.

## 사용법

### 1. 정적 서버로 실행

`file://` 경로에서는 File System Access API가 제한되므로 HTTP(S) 컨텍스트가 필요하다.

```bash
cd viewer
npx serve .          # 또는 python3 -m http.server 8000
```

브라우저에서 `http://localhost:3000` (또는 `:8000`) 접속.

### 2. 폴더 선택

1. 게임에서 `/combatlog` 입력
2. 뷰어의 "WoW Logs 폴더 선택" 버튼 클릭
3. OS 파일 탐색기에서 WoW Logs 폴더 선택
   - macOS: `~/Library/Application Support/com.blizzard.worldofwarcraft/_retail_/Logs`
   - Windows: `C:\Program Files (x86)\World of Warcraft\_retail_\Logs`
4. "이 사이트에서 폴더 내용 보기" 권한 허용

한 번 선택한 폴더는 IndexedDB에 저장되어 재방문 시 "폴더 다시 선택 (재승인)" 버튼 한 번만 누르면 복구된다.

### 3. 표시 내용

- **🛡️ 힐러 생존기**: 파티 힐러들의 생존기 쿨다운 (Guardian Spirit, Pain Suppression, Ironbark 등 9종)
- **⚔️ 인터럽트**: 파티원 인터럽트 쿨다운 (Pummel, Kick, Mind Freeze 등 14종)
- **📜 최근 캐스트**: 감지된 최근 30개 이벤트 타임라인 (인터럽트 성공 시 끊은 스펠 이름 포함)

추적 대상 스펠은 `spells.js`에 정의됨. 애드온의 `PartyCD/SpellData.lua` 와 동일한 목록.

## 제약

- **같은 PC의 브라우저 창에서만** 동작. 휴대폰/OBS/원격에서는 볼 수 없다.
- 로그에 **처음 캐스트가 나타나기 전까지** 해당 파티원의 바는 표시되지 않는다 (lazy 부트스트랩).
- 쿨다운 값은 `baseCD` 고정. 탈레트/헤이스트 보정 없음 (애드온과 동일).
- 로그 플러시 지연(수백 ms ~ 수 초)으로 완벽한 실시간은 아님.

## 개발

### 테스트

```bash
npm test
```

파서 단위 테스트 19개 (`test/parser.test.js`).

### 파일 구조

```
viewer/
├── index.html
├── app.js           # 폴더 감시, 상태 관리, 렌더링
├── parser.js        # 전투 로그 라인 파서 (순수 함수)
├── spells.js        # 추적 스펠 데이터
├── style.css
├── test/
│   ├── parser.test.js
│   └── fixtures/
│       └── sample.txt   # 샘플 전투 로그 라인
└── package.json
```

### 스펠 추가

스펠을 추가하려면 **두 곳** 모두 수정해야 한다:
1. `PartyCD/SpellData.lua` (애드온)
2. `viewer/spells.js` (뷰어)

두 파일은 독립 유지되므로 커밋 시 양쪽 동기화 확인 필수.

## 작동 원리

1. 브라우저가 `showDirectoryPicker()` 로 WoW Logs 디렉토리 권한 획득
2. 500ms 주기로 디렉토리 스캔 → 가장 최근 `WoWCombatLog-*.txt` 선택
3. 파일 크기 증가분만 증분 읽기 (`File.slice(lastPos, size).text()`)
4. 라인 단위 파싱: `SPELL_CAST_SUCCESS`, `SPELL_AURA_APPLIED`, `SPELL_INTERRUPT` 이벤트만 통과
5. `sourceFlags` 비트 검사로 파티/레이드/본인만 필터
6. `spellId` → `SpellData` 조회 → `expires = castTime + cooldown` 기록
7. 100ms `setInterval` 으로 카운트다운 바 갱신
