# 주기 관리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교체 주기(D-day)와 다녀온 지(D+)를 관리하는 '주기' 화면을 캘린더 탭 안에 만들고, 결제 기록 연결과 선택형 폰 알림을 붙인다.

**Architecture:** 주기 계산은 순수 함수(`src/domain/cycle.ts`)로 두고, 같은 규칙을 Apps Script(`apps-script/Cycle.gs`)에 옮겨 같은 테스트 사례로 검증한다. 데이터는 시트 `주기항목`·`주기기록` 탭 ↔ Dexie 테이블로 거래내역과 같은 outbox/pull 방식으로 동기화한다. 알림은 Apps Script 시간 트리거가 매일 09시에 기존 FCM 경로로 보낸다.

**Tech Stack:** React 19, TypeScript, react-router(hash), Dexie 4, Vitest(jsdom), Google Apps Script, FCM.

**Spec:** `docs/superpowers/specs/2026-11-04-cycle-tracker-design.md`

## Global Constraints

- 실명 금지: 사람은 `쿠리만쥬`/`우사기`만 쓴다(코드·테스트·문서·커밋).
- 비밀값(토큰·엔드포인트·스크립트 ID·키)은 저장소·웹 빌드·채팅에 넣지 않는다.
- 실제 시트·캘린더에 테스트 데이터를 쓰지 않는다. 화면 확인은 5201(앱 샘플)·5202(웹 샘플, `/ledger/`)에서 한다.
- 커밋은 사용자 검토 후. 웹 배포(push)는 사용자가 요청할 때만. Apps Script 서버 배포는 사용자가 "서버 배포 해줘"라고 할 때만.
- 코딩 스타일: 컴포넌트·훅은 함수 선언문, 나머지는 화살표 함수, 로컬 서브컴포넌트는 메인 아래. 주석은 도메인 특성만. 분기 3개 이상 문구는 함수로.
- 검증 명령: `rtk proxy pnpm exec tsc -b --noEmit`, `rtk proxy pnpm exec oxlint src`, `rtk proxy pnpm exec vitest run`.
- 날짜 키는 `YYYY-MM-DD`(Asia/Seoul). 알림 시각 09시 고정. 알림 시점 선택지: 당일(0), 1일 전(1), 3일 전(3), 7일 전(7).

## Review Focus

1. 월말 날짜에 주기 더하기(1월 31일 + 1개월 → 2월 28/29일, 2월 29일 + 1년 → 2월 28일) — Task 1 테스트.
2. 결제 연결이 삭제·월합계·이관·수입 기록을 잡지 않음, 조건에 카테고리도 가맹점 말도 없으면 연결 안 함 — Task 1 테스트.
3. 앱과 서버의 계산이 어긋남 — Task 2에서 같은 사례 파일로 `Cycle.gs`를 vm으로 실행해 검증.
4. 알림 중복: 트리거가 하루 두 번 돌아도 한 번, "했어요"로 마지막 날이 바뀌면 새 주기 알림은 다시 — Task 3 테스트.
5. 다른 기기에서 지운 기록(소프트 삭제)이 마지막 날 계산에서 빠짐 — Task 1·4 테스트.

---

### Task 1: 주기 계산 도메인

**Files:**
- Create: `src/domain/cycle.ts`, `src/domain/cycle.test.ts`, `src/domain/cycleCases.json`

**Interfaces:**
- Produces:
  ```ts
  export type CycleUnit = 'day' | 'week' | 'month' | 'year'
  export type CyclePeriod = { amount: number; unit: CycleUnit }
  export type CycleTarget = '공동' | Person
  export type CycleLink = { category: string; keyword: string; person: Person | '' }
  export type CycleNotify = { enabled: boolean; offsets: number[]; afterDays: number | null }
  export type CycleItem = { id: string; name: string; icon: string; target: CycleTarget; period: CyclePeriod | null; link: CycleLink | null; notify: CycleNotify; memo: string; deleted: boolean; updatedAt: string }
  export type CycleLog = { id: string; cycleId: string; date: string; person: Person; deleted: boolean; updatedAt: string }
  export type CycleState = { lastDate: string | null; lastSource: 'log' | 'payment' | null; lastMerchant: string; nextDate: string | null; days: number | null } // days: 다음 날까지 남은 날(주기 있음, 음수면 지남) 또는 지난 날(주기 없음)
  export const NOTIFY_OFFSETS = [0, 1, 3, 7]
  export const addPeriod = (dateKey: string, period: CyclePeriod): string
  export const isLinkValid = (link: CycleLink | null): boolean          // category나 keyword 중 하나는 비어 있지 않아야
  export const lastPayment = (link: CycleLink, transactions: Transaction[]): { date: string; merchant: string } | null
  export const cycleState = (item: CycleItem, logs: CycleLog[], transactions: Transaction[], today: string): CycleState
  export const sortCycles = (rows: { item: CycleItem; state: CycleState }[]): typeof rows
  export const dueOffsetToday = (item: CycleItem, state: CycleState): number | null // 오늘 보낼 알림 시점(0/1/3/7 또는 afterDays), 없으면 null
  ```
- `cycleCases.json`: `[{ name, item, logs, transactions, today, expected: { lastDate, nextDate, days, dueOffset } }]` — Task 2가 같은 파일을 서버 함수에 돌린다.

- [ ] **Step 1: 테스트 작성** — `cycle.test.ts`에서 `addPeriod`와 사례 파일을 검증한다.
  ```ts
  expect(addPeriod('2026-01-31', { amount: 1, unit: 'month' })).toBe('2026-02-28')
  expect(addPeriod('2028-02-29', { amount: 1, unit: 'year' })).toBe('2029-02-28')
  expect(addPeriod('2026-11-04', { amount: 2, unit: 'week' })).toBe('2026-11-18')
  expect(isLinkValid({ category: '', keyword: '', person: '우사기' })).toBe(false)
  cases.forEach(c => it(c.name, () => { const state = cycleState(c.item, c.logs, c.transactions, c.today); expect({ lastDate: state.lastDate, nextDate: state.nextDate, days: state.days, dueOffset: dueOffsetToday(c.item, state) }).toEqual(c.expected) }))
  ```
  사례(최소): ① 주기 6개월·기록만 → D-day ② 기록보다 최근 결제가 있으면 결제일 ③ 삭제된 기록·삭제된 결제·월합계·이관·수입은 무시 ④ 결제 사람 조건 불일치 무시 ⑤ 가맹점 말은 부분 일치(공백 무시, 대소문자 무시) ⑥ 주기 없음 → days는 경과일, afterDays=180이고 오늘 180일째면 dueOffset 180 ⑦ 3일 전·알림 켬·offsets [3] → dueOffset 3 ⑧ 알림 끔 → null ⑨ 기한 지남(days<0) → null ⑩ 기록도 결제도 없음 → 모두 null. 결제일은 `occurredAt`을 Asia/Seoul 날짜로.
- [ ] **Step 2: 실패 확인** — `rtk proxy pnpm exec vitest run src/domain/cycle.test.ts` → 모듈 없음으로 FAIL.
- [ ] **Step 3: 구현** — 위 시그니처대로. 월·년은 일자를 해당 월 말일로 자른다. 같은 날짜면 기록(log)을 우선한다. `sortCycles`: 주기 있는 항목 `days` 오름차순 → 마지막 날 없는 항목 → 주기 없는 항목 `days` 내림차순.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS.
- [ ] **Step 5: 커밋 보류** — 사용자 검토 뒤 한꺼번에 커밋한다(전역 규칙). 이후 Task도 같다.

### Task 2: 서버 저장·동기화 (Apps Script)

**Files:**
- Create: `apps-script/Cycle.gs`, `src/domain/cycleServer.test.ts`
- Modify: `apps-script/Code.gs`(SHEETS, `pull_`, `push_`), `apps-script/.claspignore`(`!Cycle.gs`)

**Interfaces:**
- Consumes: `cycleCases.json`(Task 1).
- Produces: 시트 `주기항목` 열 `id, 이름, 아이콘, 대상, 주기수, 주기단위, 연결카테고리, 연결가맹점, 연결사람, 알림, 알림시점, 경과알림일, 메모, 삭제, 수정시각, 동기화시각`(알림시점은 `0,3`처럼 쉼표 문자열), 시트 `주기기록` 열 `id, 항목id, 날짜, 사람, 삭제, 수정시각, 동기화시각`(날짜·시각 열은 텍스트 서식). `pull_` 응답에 `cycles: CycleItem[]`, `cycleLogs: CycleLog[]`(동기화시각 > since), `push_` 요청에 `cycles`, `cycleLogs`. 순수 함수 `addPeriod_`, `lastPayment_`, `cycleState_`, `dueOffsetToday_`는 Task 1과 같은 의미.

- [ ] **Step 1: 테스트 작성** — `cycleServer.test.ts`: `node:vm`으로 `apps-script/Cycle.gs` 텍스트를 새 컨텍스트에서 실행하고, 사례 파일의 각 사례에 `cycleState_`·`dueOffsetToday_`를 돌려 `expected`와 같은지 본다(시트·서비스 호출이 없는 순수 함수만 부른다).
- [ ] **Step 2: 실패 확인** — 파일 없음으로 FAIL.
- [ ] **Step 3: 구현** — `Cycle.gs`에 순수 함수와 `cycleSheets_(book)`(ensureSheet_로 두 탭 생성), `toCycleRow_/fromCycleRow_`, `toCycleLogRow_/fromCycleLogRow_`. `Code.gs`의 `pull_`·`push_`에 두 탭을 붙인다(탭이 없으면 빈 배열, push 때 생성).
- [ ] **Step 4: 통과 확인** — `vitest run src/domain/cycleServer.test.ts` PASS.

### Task 3: 알림 트리거 (Apps Script)

**Files:**
- Modify: `apps-script/Cycle.gs`, `apps-script/Push.gs`, `src/domain/cycleServer.test.ts`

**Interfaces:**
- Produces: `sendPushTo_(people: Person[], message)` (Push.gs, 토큰의 person이 people에 든 기기에만 보냄 — 기존 `sendPushToOthers_`는 이걸로 다시 쓴다), 메시지 data에 `link`(앱 내 해시 경로, 예 `/cycles?id=<id>`) 추가. `cycleReminders_(items, logs, transactions, today, sentKeys)` → `{ messages: { people, title, body, link, key }[] }`(순수), `sendCycleReminders()`(트리거 진입점: 시트 읽고 → 순수 함수 → 보내고 → 보낸 키를 스크립트 속성 `CYCLE_SENT`에 저장, 30일 지난 키는 정리), `installCycleTrigger()`(매일 09시 Asia/Seoul, 중복 설치 방지).
- 키: `${id}|${lastDate}|${offset}`. 문구: 0 → `오늘 {이름} 하는 날이에요`, n>0 → `{이름} {n}일 남았어요`, 주기 없음 → `{이름} {n}일 지났어요`. 받는 사람: 대상이 공동이면 두 사람, 아니면 그 사람.

- [ ] **Step 1: 테스트 작성** — vm으로 `cycleReminders_` 실행: 공동 항목 → people 두 명, 개인 → 한 명, sentKeys에 이미 있는 키는 제외, 마지막 날이 바뀐 새 키는 포함, 알림 끔·기한 지남은 없음.
- [ ] **Step 2: 실패 확인 → Step 3: 구현 → Step 4: 통과 확인.**

### Task 4: 앱 데이터·동기화

**Files:**
- Modify: `src/db/database.ts`(version 6: `cycles: 'id, deleted'`, `cycleLogs: 'id, cycleId, deleted'`, OutboxItem type에 `'cycle' | 'cycleLog'`), `src/sync/sync.ts`, `src/sync/api.ts`(PullResponse·push payload), `src/db/hooks.ts`
- Create: `src/db/cycles.ts`, `src/db/cycles.test.ts`

**Interfaces:**
- Consumes: Task 1 타입, Task 2 응답 필드.
- Produces:
  ```ts
  export const saveCycle = (input: Omit<CycleItem, 'id' | 'deleted' | 'updatedAt'>, id?: string): Promise<CycleItem>
  export const deleteCycle = (id: string): Promise<void>                // 소프트 삭제 + 그 항목 기록도 소프트 삭제
  export const logCycle = (cycleId: string, date: string, person: Person): Promise<CycleLog>
  export const updateCycleLog = (id: string, date: string): Promise<void>
  export const deleteCycleLog = (id: string): Promise<void>
  export function useCycleRows(today: string): { item: CycleItem; state: CycleState; logs: CycleLog[] }[] | undefined // 정렬된, 삭제 안 된 항목
  ```
- [ ] **Step 1: 테스트 작성** (`fake-indexeddb`, data.test.ts의 fetch 스텁 방식): 저장 → outbox에 `cycle`, 동기화 후 비워짐; 다른 기기에서 지운 기록(pull로 deleted=true)이 오면 `cycleState`의 lastDate가 이전 기록으로 돌아감; 전송 중 다시 고친 항목은 outbox에 남음.
- [ ] **Step 2: 실패 확인 → Step 3: 구현** (pushOutbox/pullChanges에 두 테이블을 기존 패턴대로 추가, pending id는 덮어쓰지 않음) **→ Step 4: 통과 확인.**

### Task 5: 주기 목록 화면과 탭 전환

**Files:**
- Create: `src/pages/CyclesPage.tsx`, `src/components/calendar/CalendarModeSwitch.tsx`
- Modify: `src/router.tsx`(TabLayout 자식에 `/cycles`), `src/components/TabLayout.tsx`(캘린더 탭이 `/`와 `/cycles` 모두에서 활성), `src/pages/CalendarPage.tsx`(헤더에 전환), `src/index.css`

**Interfaces:**
- Consumes: `useCycleRows`, `logCycle`, `deleteCycleLog`(되돌리기), `TARGET_TONE`·`PersonAvatar`(대상 표시).
- Produces: `CalendarModeSwitch({ mode: 'events' | 'cycles' })` — `Segmented`로 "일정 | 주기", 누르면 `navigate(..., { replace: true })`.
- 화면: 대상 거르기(전체/공동/쿠리만쥬/우사기), 행 = 아이콘·이름·대상 · D 표시(`D-23` / 지남 `D+5` 강조 / 주기 없음 `D+47 · 9월 18일` + 결제로 잡혔으면 가맹점 작게) · 주기 있으면 진행 막대 · "했어요" 버튼(오늘로 `logCycle`, 기기 사람 `DEVICE_PERSON`/설정 기본 사람, 3초 되돌리기 토스트). 행을 누르면 `/cycles/:id`. 빈 목록이면 예시 칩(수건 교체 1년🧺, 정수기 필터 6개월💧, 칫솔 3개월🪥, 치과 없음🦷 — 치과는 가맹점 말 '치과' 연결) 누르면 바로 추가. 우하단 + → `/cycles/new`. URL `?id=`가 있으면 그 행으로 스크롤하고 잠깐 강조.
- D 표시 문구는 3분기 이상이므로 `cycleBadge(state, hasPeriod)` 함수로 분리하고 테스트한다(`D-day`, `D-23`, `D+5`, `기록 없음`).
- [ ] **Step 1: `cycleBadge` 테스트 작성 → 실패 → 구현 → 통과.**
- [ ] **Step 2: 화면 구현 후 5201에서 390px iframe으로 확인**(빈 목록 예시 추가, 했어요/되돌리기, 거르기, 탭 전환 시 캘린더 탭 활성 유지). 확인용 데이터는 샘플 DB에만, 끝나면 지운다.

### Task 6: 항목 등록·수정 폼

**Files:**
- Create: `src/pages/CycleEditPage.tsx`
- Modify: `src/router.tsx`(`/cycles/new`, `/cycles/:id`, ScrollManager 아래 최상위), `src/index.css`

**Interfaces:**
- Consumes: `saveCycle`, `deleteCycle`, `logCycle`, `updateCycleLog`, `deleteCycleLog`, `isLinkValid`, `NOTIFY_OFFSETS`, `useCategories`.
- 폼: 이름(필수)·아이콘(이모지 입력, 선택)·대상(공동/쿠리만쥬/우사기)·주기(없음 또는 숫자+단위)·마지막으로 한 날(새 항목만, 날짜 고르기, 선택 — 넣으면 저장 시 `logCycle`)·결제 연결 스위치(켜면 카테고리 칩 1개 선택, 가맹점 말, 결제한 사람 누구나/쿠리만쥬/우사기; `isLinkValid` 아니면 저장 막고 안내)·알림 스위치(켜면 주기 있음: 시점 다중 선택, 기본 [0, 3]; 주기 없음: "N일 지나면" 숫자 하나)·메모. 수정 화면에는 지난 기록 목록(날짜 고치기·지우기)과 삭제 버튼(ConfirmSheet). 새 항목 저장은 `scrollToTopOnReturn()` 후 뒤로.
- 알림이 켜져 있는데 이 기기 알림이 꺼져 있으면 "설정에서 알림을 켜야 받아요" 안내(링크 `/settings`).
- [ ] **Step 1: 폼 검증 함수 `cycleFormError(draft)` 테스트(이름 없음, 연결 조건 없음, 주기 없음+알림 켬+afterDays 없음) → 실패 → 구현 → 통과.**
- [ ] **Step 2: 화면 구현 후 5201에서 확인**(등록→목록 반영, 수정, 기록 고치기·지우기, 삭제).

### Task 7: 캘린더에 교체일 표시

**Files:**
- Modify: `src/components/calendar/CalendarGrid.tsx`, `src/components/calendar/CalendarCarousel.tsx`, `src/components/calendar/DaySheet.tsx`, `src/pages/CalendarPage.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `useCycleRows`.
- Produces: `cycleDueByDate(rows): Map<string, CycleItem[]>`(주기 있는 항목의 `nextDate`만, `src/domain/cycle.ts`에 추가, 테스트 포함). 그리드 날짜 칸에 작은 점(일정 막대와 겹치지 않게 날짜 숫자 옆), DaySheet 목록 위에 "교체할 것" 줄(누르면 `/cycles?id=`).
- [ ] **Step 1: `cycleDueByDate` 테스트 → 구현 → 통과.**
- [ ] **Step 2: 표시 구현 후 5201에서 확인.**

### Task 8: 알림 눌렀을 때 열기

**Files:**
- Modify: `public/push-sw.js`, `src/push/push.ts`, `src/main.tsx`

**Interfaces:**
- Consumes: Task 3의 data `link`.
- `push-sw.js`: data에 `link`가 있으면 `./#${link}`로 연다(없으면 기존 date 처리). `listenNativePush(onOpen: (target: { date?: string; link?: string }) => void, onReceive)`로 바꾸고 `main.tsx`에서 link가 있으면 `router.navigate(link)`.
- [ ] **Step 1: 구현 후 tsc·oxlint·vitest 전체 통과 확인.**

### Task 9: 마무리 확인과 배포 준비

- [ ] 전체 검증 명령 3개 통과.
- [ ] 비밀값 스캔: 스테이지된 diff에 토큰·엔드포인트·Gemini 키가 없는지(기존 방식).
- [ ] 사용자에게 변경 요약을 보여 주고 검토받는다. 이후 사용자가 요청하면: 커밋 → "서버 배포 해줘"일 때 `deploy.py`로 서버 배포 → 편집기에서 `installCycleTrigger` 실행 안내(링크는 클립보드로) → 안드로이드 설치 → 웹 배포.
