import { describe, expect, it } from 'vitest'
import type { CycleState } from './cycle'
import { elapsedLabel, formatElapsed, formatPeriod, periodicLabel } from './cycleText'

const TODAY = '2026-11-04'

const state = (overrides: Partial<CycleState>): CycleState => ({ lastDate: null, reservation: null, nextDate: null, isReservedNext: false, days: null, ...overrides })

describe('periodicLabel', () => {
  it('다음 날까지 남은 기간을 쓰고, 일주일 안이면 눈에 띄게 한다', () => {
    expect(periodicLabel(state({ nextDate: '2026-11-27', days: 23 }), TODAY)).toEqual({ text: '23일 남음', tone: 'normal' })
    expect(periodicLabel(state({ nextDate: '2026-11-07', days: 3 }), TODAY)).toEqual({ text: '3일 남음', tone: 'soon' })
    expect(periodicLabel(state({ nextDate: '2027-02-14', days: 102 }), TODAY)).toEqual({ text: '3개월 10일 남음', tone: 'normal' })
  })

  it('당일과 지난 기간을 구분한다', () => {
    expect(periodicLabel(state({ nextDate: TODAY, days: 0 }), TODAY)).toEqual({ text: '오늘', tone: 'soon' })
    expect(periodicLabel(state({ nextDate: '2026-09-26', days: -39 }), TODAY)).toEqual({ text: '1개월 9일 지남', tone: 'overdue' })
  })

  it('기록이 없으면 그렇게 알려 준다', () => {
    expect(periodicLabel(state({}), TODAY)).toEqual({ text: '기록 없음', tone: 'empty' })
  })
})

describe('elapsedLabel', () => {
  it('마지막 날부터 지난 기간을 쓴다', () => {
    expect(elapsedLabel(state({ lastDate: '2026-10-21', days: 14 }), TODAY)).toBe('14일')
    expect(elapsedLabel(state({ lastDate: '2026-06-26', days: 131 }), TODAY)).toBe('4개월 9일')
    expect(elapsedLabel(state({ lastDate: TODAY, days: 0 }), TODAY)).toBe('오늘')
    expect(elapsedLabel(state({}), TODAY)).toBe('기록 없음')
  })
})

describe('formatElapsed', () => {
  it('30일까지는 날수로 센다', () => {
    expect(formatElapsed('2026-07-01', '2026-07-31')).toBe('30일')
    expect(formatElapsed('2026-07-01', '2026-07-02')).toBe('1일')
  })

  it('달력 기준으로 개월을 세고 남은 날을 붙인다', () => {
    expect(formatElapsed('2026-06-01', '2026-07-02')).toBe('1개월 1일')
    expect(formatElapsed('2026-01-31', '2026-03-03')).toBe('1개월 3일')
    expect(formatElapsed('2026-05-04', '2026-11-04')).toBe('6개월')
  })

  it('1년부터는 년과 개월만 쓴다', () => {
    expect(formatElapsed('2025-11-04', '2026-11-04')).toBe('1년')
    expect(formatElapsed('2024-03-20', '2026-11-04')).toBe('2년 7개월')
  })
})

describe('formatPeriod', () => {
  it('단위를 우리말로 쓴다', () => {
    expect(formatPeriod({ amount: 6, unit: 'month' })).toBe('6개월마다')
    expect(formatPeriod({ amount: 1, unit: 'year' })).toBe('1년마다')
    expect(formatPeriod({ amount: 2, unit: 'week' })).toBe('2주마다')
    expect(formatPeriod({ amount: 10, unit: 'day' })).toBe('10일마다')
    expect(formatPeriod(null)).toBe('주기 없음')
  })
})
