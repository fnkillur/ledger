# 주기 관리 2 (캘린더 기반) 구현 계획

**Goal:** 주기 항목의 마지막 날·예약을 캘린더 일정에서 읽고, 결제가 들어오면 서버가 캘린더에 1시간 일정을 만든다. 직접 기록(했어요·주기기록)은 없앤다.

**Spec:** `docs/superpowers/specs/2026-11-04-cycle-calendar-design.md`

## Global Constraints

- 실명 금지(쿠리만쥬/우사기), 비밀값 금지, 실제 시트·캘린더에 테스트 데이터 금지.
- 커밋은 사용자 검토 후, 서버·웹 배포는 요청할 때만.
- 앱과 서버 계산은 `src/domain/cycleCases.json` 공통 사례로 함께 검증한다.

## Review Focus

- 시간 일정의 날짜: 구글이 주는 `2026-08-14T10:00:00+09:00`와 앱이 낙관적으로 넣은 일정의 시작 모두 한국 날짜로 읽혀야 한다.
- 오늘 시작하는 일정은 '마지막 날'(오늘)이지 예약이 아니다.
- 같은 push 안의 두 결제(같은 날)가 일정을 두 개 만들지 않는다.
- 14일보다 오래된 결제, 월합계·이관, 수입은 일정을 만들지 않는다.
- 옛 앱이 보낸 `cycleLogs`를 서버가 받아도 실패하지 않는다.

---

### Task 1: 계산 (앱 `cycle.ts` + 서버 `Cycle.gs`, 공통 사례)

- `CycleItem`에 `keyword: string`을 더하고 `CycleLog`, `lastPayment`, `CycleState.lastSource/lastMerchant`를 없앤다.
- `CycleEvent = { title: string; start: string; target: CalendarTarget }`
- `eventDateKey(start)`: `start.slice(0, 10)`
- `matchesCycleEvent(item, event)`: 키워드(비면 이름)가 공백·대소문자 무시하고 제목에 들어 있어야 한다. 대상 규칙: 기념일 ✗, 지정일 ✓, 공동 항목은 모두 ✓, 사람 항목은 그 사람·공동 ✓.
- `cycleState(item, events, today) → { lastDate, reservation, nextDate, isReservedNext, days }`
- 공통 사례 JSON은 `events`를 받도록 바꾸고, 위 규칙과 Review Focus의 날짜 사례를 넣는다.
- 서버 `cycleState_`, `matchesCycleEvent_`도 같은 사례로 통과해야 한다.

### Task 2: 결제 → 캘린더 일정 (서버)

- 순수 함수 `cyclePaymentEvents_(items, transactions, events, now)` → `[{ title, target, start, end }]`
  - 대상 결제: 지출, 삭제 아님, 월합계·이관 아님, 결제 시각이 now 기준 14일 이내, `matchesCycleLink_` 통과.
  - 결제한 날 7일 전부터 결제한 날까지 그 항목에 맞는 일정(이미 만든 것 포함)이 있으면 건너뛴다.
  - 결제 시각에 끝나는 1시간 일정. 시각은 `+09:00` 한국 시각 문자열.
  - 제목: 이름에 키워드가 있으면 이름, 아니면 키워드. 대상: 항목이 사람이면 그 사람, 공동이면 결제한 사람.
- `push_`가 거래를 저장한 뒤 `createCyclePaymentEvents_`를 부른다. 실패해도 push는 성공한다.

### Task 3: 기록 제거 + 동기화

- Dexie 7: `cycleLogs: null`, 업그레이드에서 `cycleLog` outbox 항목을 지운다.
- `sync.ts`·`api.ts`·`cycles.ts`에서 기록 관련을 뺀다.
- 서버: `CYCLE_LOG_COLUMNS`·`SHEETS.cycleLogs` 사용을 빼고, `removeCycleLogSheet()`(편집기에서 한 번 실행)를 둔다.
- `CYCLE_COLUMNS` 끝에 '일정키워드'를 더하고, 있던 탭에 머리글이 없으면 붙인다.
- 아침 알림은 `calendarEvents_`로 앞뒤 12개월 일정을 읽어 계산한다.

### Task 4: 화면

- `useCycleRows`는 `db.calendarEvents`로 계산한다.
- 주기 탭: '다가오는 교체'(한 줄 카드, 막대, "n일 남음/지남", "6개월마다 · 다음 3월 26일 (예약)")와 '마지막으로 한 지'(두 칸 격자, 경과, "8월 14일 마지막", "예약 11월 20일") 두 섹션. 했어요·되돌리기는 없앤다.
- 수정 폼: '일정 제목에 들어간 말' 입력(자리표시: 항목 이름)을 더하고, '마지막으로 한 날 넣기'와 지난 기록을 없앤다. 결제 연결 설명은 "맞는 결제가 들어오면 캘린더에 일정을 만들어요"로 바꾼다.
- 예시 항목에 키워드를 넣는다.

### Task 5: 확인

- `tsc`, `oxlint`, `vitest` 모두 통과. 5201 샘플에서 화면을 확인하고 샘플 데이터를 지운다.
