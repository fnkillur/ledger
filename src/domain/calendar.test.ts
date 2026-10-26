import { afterEach, describe, expect, it, vi } from 'vitest'
import { dayTone, eventsOnDay, gridRange, monthGrid, type CalendarEvent } from './calendar'

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
