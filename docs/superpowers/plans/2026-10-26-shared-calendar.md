# 공유 캘린더 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가계부 앱에 구글 캘린더 하나를 원본으로 쓰는 월간 공유 캘린더 탭을 추가하고, 앱 시작 화면을 캘린더로 바꾸고, TimeTree 일정을 옮긴다.

**Architecture:** 기존 시트 서버(Apps Script, A 계정으로 실행)에 고급 Calendar 서비스로 읽기·쓰기 요청을 더한다. 앱은 연결 코드(엔드포인트+토큰)로 그 요청을 부르고, 보는 달의 일정을 Dexie에 캐시해 먼저 보여준 뒤 새로 받는다. 쓰기는 온라인일 때 바로 보낸다(outbox 없음).

**Tech Stack:** React 19, react-router 7(`createHashRouter`), Dexie 4 + dexie-react-hooks, Vitest(jsdom, `TZ=Asia/Seoul`), Google Apps Script V8 + 고급 Calendar 서비스 v3, clasp 3.4.1.

**Spec:** `docs/superpowers/specs/2026-10-26-shared-calendar-design.md`

## Global Constraints

- 실명은 코드·문서·테스트·커밋 어디에도 쓰지 않는다. 화면 이름은 항상 `displayName(person, nicknames)`를 거친다.
- 캘린더 ID, 토큰, 엔드포인트는 저장소·웹 빌드·채팅에 넣지 않는다. 캘린더 ID는 gitignore된 `apps-script/Secret.gs`의 `CALENDAR_ID`(없으면 스크립트 속성 `CALENDAR_ID`).
- 구글 '참석자(attendees)'는 절대 쓰지 않는다. 대상은 `extendedProperties.private.target`.
- 대상 값: `'공동' | '쿠리만쥬' | '우사기' | '없음'`. 구글 colorId: 공동 `'3'`, 쿠리만쥬 `'6'`, 우사기 `'4'`, 없음 `'8'`.
- 앱 배경 톤: 공동 `tone-purple`, 쿠리만쥬 `tone-orange`, 우사기 `tone-pink`, 없음 `tone-gray`.
- 반복 값: `'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'` ↔ `RRULE:FREQ=DAILY|WEEKLY|MONTHLY|YEARLY`.
- 반복 회차 수정·삭제 범위: `'one' | 'following' | 'all'` (화면 문구: 이 일정만 / 이후 모두 / 전체).
- 주는 일요일부터. 일요일 숫자 빨강, 토요일 파랑, 다른 달 날짜 흐리게.
- 커밋은 사용자 검토 후에만 한다(전역 규칙). 아래 각 Task의 'Commit' 단계는 "커밋할 묶음 정리"로 읽고, 실제 `git commit`은 사용자가 승인한 뒤 한다. 푸시와 Apps Script 배포도 사용자에게 먼저 묻는다.
- 실제 시트·캘린더에 테스트 데이터를 쓰지 않는다. 서버 검증은 Task 2의 별도 '테스트' 캘린더로 한다.
- 컴포넌트·훅은 함수 선언문, 나머지 함수는 화살표 함수. 자식 없는 태그는 self-closing. 주석은 도메인 특성만.

## Review Focus

1. **종일 일정의 끝 날짜**: 구글은 종일 일정의 `end.date`가 다음 날(배타)이다. 하루짜리 종일 일정이 이틀에 걸쳐 보이면 안 된다 → Task 3 `eventsOnDay` 테스트, Task 2 변환 확인.
2. **자정을 넘는 시간 일정**(23:00~01:00): 시작일과 다음 날 칸 둘 다에 보여야 한다 → Task 3 테스트.
3. **줄 수가 특이한 달**: 2026-08(1일 토요일, 31일)은 6줄, 2026-02(1일 일요일, 28일)는 4줄로 끝나지만 스펙의 '5주 또는 6주'에 맞춰 다음 주를 덧붙여 5줄 → Task 3 `monthGrid` 테스트.
4. **'이후 모두'로 첫 회차를 고칠 때**: 시리즈 전체 수정과 같아야 하고, 빈 시리즈(UNTIL이 시작보다 앞)가 남으면 안 된다 → Task 2 서버 검증 항목.
5. **오프라인에서 저장**: 입력 내용이 지워지지 않고 오류 문구가 보여야 한다 → Task 6 테스트.

---

### Task 1: 시작 화면을 캘린더로, 내역은 `/list`로

**Files:**
- Modify: `src/router.tsx`, `src/components/TabLayout.tsx`, `src/pages/EditPage.tsx:104`, `src/pages/ImportCapturePage.tsx:122`, `src/pages/MonthlyPage.tsx:109-110`
- Create: `src/pages/CalendarPage.tsx` (이 Task에서는 `PeriodHeader` 자리만 있는 빈 페이지)

**Interfaces:**
- Produces: 경로 상수 `LIST_PATH = '/list'`(`src/router.tsx`에서 export). 캘린더는 `/`.

- [ ] **Step 1:** 라우터에서 `/` → `CalendarPage`, `/list` → `ListPage`. 탭 순서: 캘린더(`CalendarBlankIcon`, `to="/" end`), 내역(`to="/list"`), 통계, 수집함, 설정.
- [ ] **Step 2:** 내역으로 돌아가야 하는 곳을 `LIST_PATH`로 바꾼다: EditPage `goBack`의 기본 경로, ImportCapturePage 가져오기 완료 후, MonthlyPage 뒤로 가기 대체 경로. `TopBar`·`NotFoundPage`의 `/`는 그대로(홈=캘린더).
- [ ] **Step 3:** `pnpm exec tsc -b && pnpm test && pnpm exec oxlint` 통과. 5201에서 앱을 열면 캘린더 탭이 선택돼 있고, 내역 저장 후 내역 탭으로 돌아오는지 확인.
- [ ] **Step 4: Commit 묶음** — `시작 화면을 캘린더 탭으로, 내역은 /list`

### Task 2: 시트 서버 캘린더 요청

**Files:**
- Modify: `apps-script/appsscript.json`, `apps-script/Code.gs`
- Create: `apps-script/Calendar.gs`
- Modify (gitignored, 값 출력 금지): `apps-script/Secret.gs`

**Interfaces:**
- Produces (HTTP):
  - `GET ?action=calendar&token=…&start=YYYY-MM-DD&end=YYYY-MM-DD` → `{ ok, events: CalendarEvent[] }` (`end` 포함)
  - `POST {action:'calendarSave', token, event: CalendarEventInput, scope?: RepeatScope}` → `{ ok, id }`
  - `POST {action:'calendarDelete', token, ref: CalendarEventRef, scope: RepeatScope}` → `{ ok }`
  - `POST {action:'calendarImport', token, events: (CalendarEventInput & {uid: string})[]}` → `{ ok, added, skipped }` (한 번에 최대 100건)
- 공통 모양(서버·앱 동일):
  ```ts
  type CalendarTarget = '공동' | '쿠리만쥬' | '우사기' | '없음'
  type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  type RepeatScope = 'one' | 'following' | 'all'
  // 종일: start/end = 'YYYY-MM-DD', end는 포함(마지막 날). 시간: ISO 문자열.
  type CalendarEvent = { id: string; seriesId: string | null; originalStart: string | null; title: string; allDay: boolean; start: string; end: string; target: CalendarTarget; repeat: Repeat }
  type CalendarEventRef = { id: string; seriesId: string | null; originalStart: string | null }
  // rrule은 TimeTree 가져오기 전용: 있으면 repeat 대신 원문 규칙을 쓴다.
  type CalendarEventInput = Omit<CalendarEvent, 'id' | 'seriesId' | 'originalStart'> & { ref?: CalendarEventRef; rrule?: string }
  ```

- [ ] **Step 1:** `appsscript.json`에 `"dependencies": {"enabledAdvancedServices": [{"userSymbol": "Calendar", "serviceId": "calendar", "version": "v3"}]}`를 넣고 `oauthScopes`에 `https://www.googleapis.com/auth/calendar`를 더한다(기존 스코프 유지).
- [ ] **Step 2:** `Calendar.gs`에 구현. 핵심 규칙:
  - 읽기: `Calendar.Events.list(id, {timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 2500})`, `pageToken` 반복. 반복 회차의 `repeat`는 `recurringEventId`별로 마스터를 한 번씩 `Calendar.Events.get`해서 `RRULE:FREQ`로 정한다. 종일 `end.date`는 하루 빼서 돌려준다. 대상 속성이 없으면 `'없음'`.
  - 저장(새 일정): `Calendar.Events.insert`에 `summary`, `start/end`(종일은 `{date}`, end+1일 / 시간은 `{dateTime, timeZone: 'Asia/Seoul'}`), `recurrence`(입력에 `rrule`이 있으면 그 원문, 없으면 `repeat`로 만든 규칙), `colorId`, `extendedProperties.private.target`.
  - 저장(기존, `ref` 있음): 반복이 아니거나 `scope='one'` → 그 id를 `patch`. `scope='all'` → 마스터를 `patch`하되 시작이 바뀌면 `(새 시작 - originalStart)`만큼 마스터 시작·끝을 옮긴다. `scope='following'` → 마스터 RRULE에 `UNTIL=(originalStart 직전)`을 붙이고 입력으로 새 시리즈를 `insert`. `originalStart`가 마스터 시작과 같으면 `all`과 같게 처리.
  - 삭제: `one` → 그 회차 id `remove`(구글이 취소 예외로 남김). `following` → 마스터에 `UNTIL`(첫 회차면 마스터 `remove`). `all` → 마스터 `remove`.
  - 가져오기: `privateExtendedProperty: 'uid=<uid>'`로 이미 있는지 찾아 있으면 건너뛰고, 없으면 `insert`에 `extendedProperties.private.uid`도 저장.
  - 캘린더 ID: `typeof CALENDAR_ID !== 'undefined' ? CALENDAR_ID : PropertiesService.getScriptProperties().getProperty('CALENDAR_ID')`, 없으면 `'캘린더가 연결되지 않았어요.'` 오류.
  - `authorizeCalendar()` 함수: `Calendar.CalendarList.list()`만 부르는 빈 함수(사용자가 편집기에서 한 번 실행해 권한 허용).
- [ ] **Step 3:** `Code.gs`의 `doGet`/`doPost`에 위 action을 연결한다.
- [ ] **Step 4 (사용자 단계):** 사용자에게 (a) 구글 캘린더 웹에서 공유 캘린더와 별도 **'테스트' 캘린더**를 만들고 (b) 테스트 캘린더 ID를 클립보드에 복사해 달라고 한다. `pbpaste`로 읽어 `Secret.gs`에 `CALENDAR_ID`를 쓰는 python 스크립트로 넣고 길이만 출력한다.
- [ ] **Step 5 (사용자 승인 후):** `clasp push --force` → 사용자가 Apps Script 편집기에서 `authorizeCalendar` 실행해 권한 허용 → `update-deployment`.
- [ ] **Step 6:** 로컬 python 스크립트로 테스트 캘린더에 대해 확인(값은 출력하지 않고 결과 요약만): 종일 하루 일정의 `end`가 같은 날로 오는지 / 매주 반복 3회차를 `one`·`following`·`all`로 고쳤을 때 결과 / 첫 회차 `following` = `all` / 삭제 3종 / `calendarImport` 같은 uid 두 번 → 두 번째 `added: 0`. 끝나면 테스트 일정을 모두 지운다.
- [ ] **Step 7 (사용자 승인 후):** `CALENDAR_ID`를 실제 공유 캘린더 ID로 바꿔(같은 클립보드 방식) push·배포.
- [ ] **Step 8: Commit 묶음** — `시트 서버 캘린더 읽기·쓰기·가져오기` (`Secret.gs` 제외 확인)

### Task 3: 캘린더 도메인 로직

**Files:**
- Create: `src/domain/calendar.ts`, `src/domain/calendar.test.ts`

**Interfaces:**
- Produces: Task 2의 타입들(export), 그리고
  - `monthGrid(monthKey: string): string[][]` — 주(일~토) 배열, 각 원소는 `'YYYY-MM-DD'`. 5 또는 6줄(4줄로 끝나는 달은 다음 주를 덧붙여 5줄).
  - `eventsOnDay(events: CalendarEvent[], dateKey: string): CalendarEvent[]` — 그날에 걸친 일정. 정렬: `없음` → 종일 → 시작 시각 순.
  - `dayTone(dateKey: string, monthKey: string): { weekday: 'sun' | 'sat' | null; isOutside: boolean; isToday: boolean }`
  - `TARGET_TONE: Record<CalendarTarget, string>`, `REPEAT_LABEL: Record<Repeat, string>` (`안 함/매일/매주/매월/매년`)
  - `gridRange(monthKey): { start: string; end: string }` — 그리드 첫날·마지막 날(서버 요청 범위).

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  expect(monthGrid('2026-10')).toHaveLength(5)
  expect(monthGrid('2026-10')[0][0]).toBe('2026-09-27')
  expect(monthGrid('2026-08')).toHaveLength(6)
  expect(monthGrid('2026-02')).toHaveLength(5)           // 2026-02-01 일요일, 28일
  expect(monthGrid('2026-02').at(-1)![6]).toBe('2026-03-07')
  const allDay = ev({ allDay: true, start: '2026-10-05', end: '2026-10-05' })
  expect(eventsOnDay([allDay], '2026-10-06')).toEqual([])
  const night = ev({ start: '2026-10-05T23:00:00+09:00', end: '2026-10-06T01:00:00+09:00' })
  expect(eventsOnDay([night], '2026-10-06')).toEqual([night])
  // 정렬: 없음 → 종일 → 시간순
  expect(eventsOnDay([timed9, allDayShared, noneEvent], '2026-10-05').map(e => e.id)).toEqual(['none', 'allday', 't9'])
  expect(dayTone('2026-10-04', '2026-10')).toMatchObject({ weekday: 'sun', isOutside: false })
  expect(dayTone('2026-09-27', '2026-10').isOutside).toBe(true)
  ```
- [ ] **Step 2:** `pnpm test src/domain/calendar.test.ts` → FAIL.
- [ ] **Step 3:** 구현. 시간 일정의 '걸침'은 `start < 다음날 0시 && end > 그날 0시`(끝이 정확히 0시면 그날 미포함). `isToday`는 `new Date()` 기준(테스트는 `vi.setSystemTime`).
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit 묶음** — `캘린더 월 그리드와 날짜별 일정 계산`

### Task 4: 캘린더 API 호출과 캐시

**Files:**
- Create: `src/sync/calendarApi.ts`, `src/db/calendar.ts`, `src/db/calendar.test.ts`
- Modify: `src/db/database.ts` (version 4), `src/sync/api.ts`(공통 `unwrap` export)

**Interfaces:**
- Consumes: Task 2 HTTP, Task 3 타입·`gridRange`.
- Produces:
  - `fetchCalendar(settings: Settings, start: string, end: string): Promise<CalendarEvent[]>`
  - `saveCalendarEvent(settings, input: CalendarEventInput, scope?: RepeatScope): Promise<string>`
  - `deleteCalendarEvent(settings, ref: CalendarEventRef, scope: RepeatScope): Promise<void>`
  - Dexie `calendarMonths: 'monthKey'` 행 `{ monthKey: string; events: CalendarEvent[]; fetchedAt: string }`
  - `refreshCalendarMonth(monthKey: string): Promise<void>` — 받아서 캐시 교체. 연결 안 됐으면 아무것도 안 함.
  - `useCalendarMonth(monthKey: string): { events: CalendarEvent[]; error: string | null; refresh: () => Promise<void> }` — 캐시를 바로 주고, 마운트·`monthKey` 변경·앱 복귀(`visibilitychange` visible) 때 새로 받는다.
  - `saveAndRefresh<T>(monthKey, write: (settings) => Promise<T>): Promise<T>` — 저장·삭제 후 보던 달은 다시 받고 다른 달 캐시는 비운다(반복 일정이 여러 달을 바꿀 수 있어서).

- [ ] **Step 1: 실패하는 테스트** (`fake-indexeddb/auto`, `fetch` 목): 캐시가 있으면 `fetch` 전에 그 이벤트가 나온다 / `refreshCalendarMonth('2026-10')`가 `gridRange`의 start·end로 요청하고 캐시를 바꾼다 / 서버가 `{ok:false,error:'캘린더가 연결되지 않았어요.'}`면 그 문구로 throw.
- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현. **Step 4:** PASS + `tsc -b`.
- [ ] **Step 5: Commit 묶음** — `캘린더 일정 불러오기와 달별 캐시`

### Task 5: 캘린더 화면 (그리드, 월 이동, 바텀시트)

**Files:**
- Modify: `src/pages/CalendarPage.tsx`, `src/components/PeriodSwitcher.tsx`, `src/components/PeriodPickerSheet.tsx`, `src/utils/viewState.ts`, `src/index.css`
- Create: `src/components/CalendarGrid.tsx`, `src/components/DaySheet.tsx`, `src/components/CalendarEventChip.tsx`

**Interfaces:**
- Consumes: Task 3, Task 4 `useCalendarMonth`.
- Produces:
  - `PeriodSwitcher`에 선택 props `monthOnly?: boolean`, `unbounded?: boolean`(true면 이전·다음 비활성화 없음, 피커의 연도도 제한 없음, 월별/연도별 전환 숨김). 기존 호출은 그대로 동작.
  - `useCalendarViewMonth(): [string, (monthKey: string) => void]` — 내역 기간과 별개의 모듈 상태, 기본값 이번 달.
  - `CalendarEventChip({ event, nicknames })`: 톤 배경 + 짤(공동은 쿠리만쥬·우사기 `PersonAvatar` 나란히, 개인은 그 사람, 없음은 없음) + 제목 한 줄 말줄임.
  - `DaySheet({ dateKey, events, onClose })`: 제목 `10월 5일 (일)`, 일정 목록(짤, 제목, `하루 종일` 또는 `09:00 – 10:00`, 반복이면 `매주` 등), 일정 누르면 `/calendar/event/:id`(state로 이벤트 전달), 시트 안 `＋` → `/calendar/new?date=YYYY-MM-DD`.

- [ ] **Step 1:** 페이지 구성: `PeriodHeader`와 같은 모양의 머리(가운데 `PeriodSwitcher monthOnly unbounded`), 요일 줄(일 빨강, 토 파랑), `CalendarGrid`, 오른쪽 아래 `.fab` `＋` → 이번 달이면 오늘, 아니면 그 달 1일로 `/calendar/new?date=`.
- [ ] **Step 2:** 높이: 페이지를 세로 flex로, 그리드는 `flex: 1; min-height: 0; display: grid; grid-template-rows: repeat(var(--weeks), 1fr)`, 칸은 `overflow: hidden`. 탭 바 높이와 safe-area를 뺀 나머지를 채운다. 칸에 다 못 들어가는 일정은 마지막 줄을 `+N`으로(칸 높이로 들어갈 개수를 계산하는 대신 칸당 최대 표시 수를 `ResizeObserver`로 구함).
- [ ] **Step 3:** 날짜 숫자: `dayTone`대로 일 `--color-sunday`, 토 `--color-saturday`(라이트·다크 토큰 추가), 다른 달 `opacity`, 오늘 숫자에 동그라미.
- [ ] **Step 4:** 가로 스와이프: 그리드에서 `pointerdown/up`으로 `|dx| > 50 && |dx| > |dy|`면 한 달 이동.
- [ ] **Step 5:** 날짜 칸 누르면 `DaySheet`(기존 `.sheet-backdrop`/`.sheet` 스타일, `createPortal`). 오류(`error`)가 있으면 그리드 위에 `.status` 한 줄, 연결 안 됐으면 내역 탭과 같은 설정 안내.
- [ ] **Step 6:** `__seed.html`에 캘린더 캐시 샘플(`calendarMonths` 10월: 공동 종일, 개인 둘, 없음 하나, 반복 하나, 자정 넘는 일정, 한 날짜에 6개)을 추가해 5201/5202에서 확인: 폴드 펼친 비율(예: 884×1104)과 일반 폰(412×915)에서 스크롤 없이 5주/6주가 들어오는지, 다크 모드, 스와이프, 바텀시트. (`__seed.html`은 커밋 금지 파일)
- [ ] **Step 7:** `tsc -b`, `oxlint`, `pnpm test` 통과.
- [ ] **Step 8: Commit 묶음** — `캘린더 탭 월간 그리드와 날짜별 바텀시트`

### Task 6: 일정 추가·수정·삭제 화면

**Files:**
- Create: `src/pages/CalendarEventPage.tsx`, `src/components/RepeatScopeSheet.tsx`, `src/pages/CalendarEventPage.test.tsx`
- Modify: `src/router.tsx` (`/calendar/new`, `/calendar/event/:id`), `src/index.css`

**Interfaces:**
- Consumes: Task 4 `saveCalendarEvent`/`deleteCalendarEvent`/`refreshCalendarMonth`, Task 3 타입·`REPEAT_LABEL`.
- Produces: `RepeatScopeSheet({ action: '수정' | '삭제', onSelect: (scope: RepeatScope) => void, onClose })`.

- [ ] **Step 1: 실패하는 테스트** (`saveCalendarEvent` 목): 새 일정에서 제목 비우면 저장 비활성 / 대상 기본값은 이 폰의 `defaultPerson` / 반복 일정 수정 저장 시 범위 시트가 뜨고 '이후 모두'를 고르면 `scope: 'following'`으로 호출 / `saveCalendarEvent`가 reject하면 입력값이 남고 `저장하지 못했어요. 인터넷 연결을 확인해 주세요.`가 보인다.
- [ ] **Step 2:** FAIL. **Step 3:** 구현: 항목은 제목, 대상(Segmented: 공동 / A 표시 이름 / B 표시 이름 / 없음), 하루 종일 스위치, 시작·끝(종일이면 날짜만, 아니면 날짜+시간; 시작을 바꾸면 끝을 같은 길이만큼 따라 옮김), 반복(Segmented `REPEAT_LABEL`). 새 일정의 기본: `?date=`의 날짜, 종일 꺼짐, 시작은 다음 정시, 1시간. 기존 일정은 `location.state` 이벤트, 없으면 캐시에서 id로 찾고 그래도 없으면 `NotFoundPage`. 수정 화면에 삭제 버튼(반복이면 범위 시트, 아니면 `ConfirmSheet`). 저장·삭제 성공 후 `navigate(-1)`.
- [ ] **Step 4:** PASS + `tsc -b`, `oxlint`.
- [ ] **Step 5:** 5201에서 화면 흐름 확인(서버 호출은 실패하므로 오류 문구 경로 확인). 실제 저장은 Task 2의 테스트 캘린더가 연결된 상태에서 사용자 확인 후 한 번 확인한다.
- [ ] **Step 6: Commit 묶음** — `캘린더 일정 추가·수정·삭제`

### Task 7: 실명 표시 확인

**Files:** 없음(설정 값만)

- [ ] **Step 1:** 화면에 '쿠리만쥬'/'우사기' 글자가 `displayName`을 거치지 않고 나오는 곳이 없는지 다시 확인(`grep`으로 JSX 텍스트·문구 검색; 현재 남은 건 내부 키·주석·아바타 이모지뿐).
- [ ] **Step 2:** 사용자에게 설정 > 닉네임에 실명을 넣어 달라고 안내(두 폰에 동기화됨). 저장소에는 아무것도 바꾸지 않는다.

### Task 8: TimeTree 일정 옮기기 (일회성)

**Files:**
- Create: `scripts/timetree-import.mjs` (커밋 가능, 데이터 없음). `.ics`와 결과물은 저장소 밖(스크래치 폴더)에 둔다.

**Interfaces:**
- Consumes: Task 2 `calendarImport`.

- [ ] **Step 1 (사용자 단계):** 사용자가 TimeTree-Exporter로 공유 캘린더를 내보내 `.ics` 경로를 알려 준다.
- [ ] **Step 2:** 파일을 열어 실제로 어떤 필드가 있는지 확인: `BEGIN:VEVENT` 개수, `ATTENDEE`/참여자 표현, 색·라벨 필드(`CATEGORIES`, `COLOR` 등), `RRULE`, 종일 표기. 결과를 사용자에게 보여주고 **색 → 대상 대응**을 받는다.
- [ ] **Step 3:** 스크립트: `.ics` → `CalendarEventInput & {uid}` 변환. 대상 규칙: 참여자 둘 → 공동, 한 명 → 그 사람, 없으면 색 대응, 그것도 없으면 없음. `RRULE`은 FREQ만 앱 반복 값(`repeat`)으로 매핑하고 원문은 `rrule`로 함께 보낸다(Task 2 서버가 원문을 우선 사용).
- [ ] **Step 4:** `--dry-run`으로 대상별·반복별 건수와 샘플 5건을 보여주고 사용자 확인을 받는다.
- [ ] **Step 5 (사용자 승인 후):** 100건씩 `calendarImport`. 중간에 실패하면 같은 명령을 다시 실행(uid로 중복 건너뜀). 마지막에 `added/skipped` 합계 보고.
- [ ] **Step 6: Commit 묶음** — `TimeTree 일정 가져오기 스크립트`

### 마무리

- [ ] 웹 빌드(`pnpm build:web`)·안드로이드 빌드(`pnpm android:apk`) 통과, 폰 연결 시 설치.
- [ ] 사용자 검토 → 커밋·푸시 승인 → 커밋·푸시. Apps Script 배포는 Task 2에서 이미 승인받은 대로.
