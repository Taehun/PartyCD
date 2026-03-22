# PartyCD

WoW 12.0.1 (Midnight) 공대/파티 쿨타임 추적 애드온

공대 힐러의 **생존기**와 같은 파티 딜러의 **차단기** 쿨타임을 실시간으로 추적합니다.

## 기능

- **힐러 생존기 추적** — Guardian Spirit, Pain Suppression, Ironbark, Life Cocoon 등 9종
- **딜러 차단기 추적** — Kick, Pummel, Wind Shear, Counterspell 등 13종
- **하이브리드 감지** — 로컬 시전 감지 + 애드온 간 통신으로 정확도 극대화
- **12.0.0+ Secret Values 대응** — 보스전/M+ 중에도 에러 없이 안전 동작
- **한국어/영어 지원**

## 추적 대상 스킬

### 힐러 생존기

| 클래스 | 스킬 | 쿨타임 |
|--------|------|--------|
| 사제 (신성) | Guardian Spirit | 3분 |
| 사제 (수양) | Pain Suppression | 3분 |
| 드루이드 (회복) | Ironbark | 1분 30초 |
| 성기사 (신성) | Blessing of Sacrifice | 2분 |
| 성기사 (신성) | Lay on Hands | 7분 |
| 수도사 (운무) | Life Cocoon | 2분 |
| 주술사 (복원) | Spirit Link Totem | 3분 |
| 주술사 (복원) | Ancestral Protection Totem | 5분 |
| 기원사 (보존) | Rewind | 4분 |

### 딜러 차단기

| 클래스 | 스킬 | 쿨타임 |
|--------|------|--------|
| 도적 | Kick | 15초 |
| 전사 | Pummel | 15초 |
| 죽음의 기사 | Mind Freeze | 15초 |
| 사냥꾼 | Counter Shot | 24초 |
| 수도사 | Spear Hand Strike | 15초 |
| 악마사냥꾼 | Disrupt | 15초 |
| 주술사 | Wind Shear | 15초 |
| 마법사 | Counterspell | 25초 |
| 기원사 | Quell | 20초 |
| 드루이드 | Skull Bash | 15초 |
| 성기사 | Rebuke | 15초 |
| 흑마법사 | Spell Lock | 24초 |
| 흑마법사 | Axe Toss | 30초 |

## 설치

1. [최신 릴리즈](https://github.com/Taehun/PartyCD/releases/latest)에서 `PartyCD.zip` 다운로드
2. 압축 해제
3. `PartyCD` 폴더를 아래 경로에 복사:
   ```
   World of Warcraft/_retail_/Interface/AddOns/
   ```
4. 게임 재시작 또는 `/reload`

## 사용법

| 명령어 | 설명 |
|--------|------|
| `/pcd` | 도움말 |
| `/pcd lock` | 프레임 잠금/해제 |
| `/pcd reset` | 위치 초기화 |
| `/pcd survival` | 생존기 패널 토글 |
| `/pcd interrupt` | 차단기 패널 토글 |

- 프레임은 잠금 해제 상태에서 **드래그**로 위치 이동 가능
- 이름 옆 `*` 표시 = 상대방이 애드온 미설치 (로컬 추정치)

## 동작 방식

### 하이브리드 감지

| 방식 | 설명 | 정확도 |
|------|------|--------|
| **로컬 감지** | `UNIT_SPELLCAST_SUCCEEDED`로 시전 감지, 기본 쿨타임 테이블 기반 타이머 | ~80% (쿨감 미반영) |
| **애드온 통신** | 각 플레이어가 본인의 실제 쿨타임을 `C_ChatInfo`로 브로드캐스트 | 100% |

애드온 통신 데이터가 있으면 로컬 감지 데이터를 자동으로 덮어씁니다.

### Secret Values (12.0.0+) 대응

WoW 12.0.0에서 도입된 Secret Values 시스템으로 인해, **보스전/M+/PvP 중** 다른 플레이어의 시전 정보가 제한됩니다.

| 상황 | 로컬 감지 | 애드온 통신 | 결과 |
|------|-----------|-------------|------|
| 평상시 (필드/일반 던전) | O | O | 전원 추적 가능 |
| 보스전/M+/PvP (전원 설치) | X (Secret 차단) | O | 정상 추적 |
| 보스전/M+/PvP (일부 미설치) | X | X (미설치자) | 미설치자만 추적 불가 |

> **보스전/M+에서 정확한 추적을 위해서는 파티원 전원 설치를 권장합니다.**

## 라이선스

MIT

## 기여

이슈 리포트 및 PR 환영합니다.
