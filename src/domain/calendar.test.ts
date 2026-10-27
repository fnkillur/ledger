import { afterEach, describe, expect, it, vi } from 'vitest'
import { dayTone, eventsOnDay, gridRange, monthGrid, targetLabel, weekLayout, type CalendarEvent } from './calendar'

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'event',
  seriesId: null,
  originalStart: null,
  title: '일정',
  allDay: false,
  start: '2026-10-05T09:00:00+09:00',
  end: '2026-10-05T10:00:00+09:00',
  target: '공동',
  repeat: 'none',
  ...overrides,
})

describe('monthGrid', () => {
  it('일요일부터 시작하는 주로 그 달을 덮는다', () => {
    const grid = monthGrid('2026-10')

    expect(grid).toHaveLength(5)
    expect(grid[0][0]).toBe('2026-09-27')
    expect(grid.at(-1)![6]).toBe('2026-10-31')
  })

  it('6주에 걸친 달은 6줄', () => {
    expect(monthGrid('2026-08')).toHaveLength(6)
  })

  it('4주로 딱 떨어지는 달도 다음 주를 붙여 5줄로 보여준다', () => {
    const grid = monthGrid('2026-02')

    expect(grid).toHaveLength(5)
    expect(grid.at(-1)![6]).toBe('2026-03-07')
  })

  it('서버에 요청할 범위는 그리드의 첫날과 마지막 날', () => {
    expect(gridRange('2026-10')).toEqual({ start: '2026-09-27', end: '2026-10-31' })
  })
})

describe('eventsOnDay', () => {
  it('하루짜리 종일 일정은 다음 날에 보이지 않는다', () => {
    const allDay = event({ allDay: true, start: '2026-10-05', end: '2026-10-05' })

    expect(eventsOnDay([allDay], '2026-10-05')).toEqual([allDay])
    expect(eventsOnDay([allDay], '2026-10-06')).toEqual([])
  })

  it('여러 날 종일 일정은 마지막 날까지 보인다', () => {
    const trip = event({ allDay: true, start: '2026-10-05', end: '2026-10-07' })

    expect(eventsOnDay([trip], '2026-10-07')).toEqual([trip])
    expect(eventsOnDay([trip], '2026-10-08')).toEqual([])
  })

  it('자정을 넘는 시간 일정은 다음 날에도 보이고, 0시에 끝나면 다음 날엔 없다', () => {
    const night = event({ start: '2026-10-05T23:00:00+09:00', end: '2026-10-06T01:00:00+09:00' })
    const untilMidnight = event({ start: '2026-10-05T22:00:00+09:00', end: '2026-10-06T00:00:00+09:00' })

    expect(eventsOnDay([night], '2026-10-06')).toEqual([night])
    expect(eventsOnDay([untilMidnight], '2026-10-06')).toEqual([])
  })

  it('없음 → 종일 → 시작 시각 순으로 정렬한다', () => {
    const timed = event({ id: 'timed', start: '2026-10-05T09:00:00+09:00' })
    const early = event({ id: 'early', start: '2026-10-05T07:00:00+09:00', end: '2026-10-05T08:00:00+09:00' })
    const allDay = event({ id: 'allDay', allDay: true, start: '2026-10-05', end: '2026-10-05' })
    const none = event({ id: 'none', allDay: true, start: '2026-10-05', end: '2026-10-05', target: '없음' })

    expect(eventsOnDay([timed, allDay, early, none], '2026-10-05').map(item => item.id)).toEqual(['none', 'allDay', 'early', 'timed'])

    const noneEarly = event({ id: 'noneEarly', target: '없음', start: '2026-10-05T08:00:00+09:00', end: '2026-10-05T08:30:00+09:00' })
    expect(eventsOnDay([noneEarly, none], '2026-10-05').map(item => item.id)).toEqual(['none', 'noneEarly'])
  })
})

describe('dayTone', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('일요일·토요일과 다른 달 날짜, 오늘을 알려준다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 26, 12))

    expect(dayTone('2026-10-04', '2026-10')).toEqual({ weekday: 'sun', isOutside: false, isToday: false })
    expect(dayTone('2026-10-03', '2026-10')).toMatchObject({ weekday: 'sat' })
    expect(dayTone('2026-09-27', '2026-10')).toMatchObject({ isOutside: true })
    expect(dayTone('2026-10-26', '2026-10')).toEqual({ weekday: null, isOutside: false, isToday: true })
  })
})

describe('weekLayout', () => {
  const week = monthGrid('2026-10')[1]

  it('여러 날 일정은 주 안에서 한 막대로, 주를 넘으면 잘린 쪽을 표시한다', () => {
    const trip = event({ id: 'trip', allDay: true, start: '2026-10-02', end: '2026-10-06' })

    expect(weekLayout(week, [trip], 3).bars).toEqual([{ event: trip, startColumn: 0, span: 3, lane: 0, continuesBefore: true, continuesAfter: false }])
  })

  it('겹치는 일정은 다른 줄에 놓고, 긴 일정을 먼저 놓는다', () => {
    const single = event({ id: 'single', allDay: true, start: '2026-10-05', end: '2026-10-05' })
    const long = event({ id: 'long', allDay: true, start: '2026-10-05', end: '2026-10-07' })
    const later = event({ id: 'later', allDay: true, start: '2026-10-07', end: '2026-10-07' })

    const lanes = Object.fromEntries(weekLayout(week, [single, long, later], 3).bars.map(bar => [bar.event.id, bar.lane]))
    expect(lanes).toEqual({ long: 0, single: 1, later: 1 })
  })

  it('줄이 모자라면 마지막 줄은 +N 자리로 비우고 날짜별로 숨은 개수를 센다', () => {
    const items = ['a', 'b', 'c'].map(id => event({ id, allDay: true, start: '2026-10-05', end: '2026-10-05' }))

    const layout = weekLayout(week, items, 2)
    expect(layout.bars.map(bar => bar.event.id)).toEqual(['a'])
    expect(layout.hidden[1]).toBe(2)
    expect(layout.moreLane).toBe(1)
  })
})

describe('targetLabel', () => {
  it('캘린더에서는 공동을 우리로, 없음을 지정일로 보여 준다', () => {
    const name = (person: string) => `${person} 이름`

    expect(['공동', '쿠리만쥬', '우사기', '기념일', '없음'].map(target => targetLabel(target as never, name))).toEqual([
      '우리',
      '쿠리만쥬 이름',
      '우사기 이름',
      '기념일',
      '지정일',
    ])
  })
})
