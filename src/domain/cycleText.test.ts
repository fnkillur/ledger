import { describe, expect, it } from 'vitest'
import type { CycleState } from './cycle'
import { cycleBadge, formatPeriod } from './cycleText'

const state = (days: number | null): CycleState => ({ lastDate: days === null ? null : '2026-09-18', lastSource: 'log', lastMerchant: '', nextDate: null, days })

describe('cycleBadge', () => {
  it('주기 있는 항목은 남은 날, 당일, 지난 날을 구분한다', () => {
    expect(cycleBadge(state(23), true)).toEqual({ text: 'D-23', tone: 'normal' })
    expect(cycleBadge(state(3), true)).toEqual({ text: 'D-3', tone: 'soon' })
    expect(cycleBadge(state(0), true)).toEqual({ text: 'D-day', tone: 'soon' })
    expect(cycleBadge(state(-5), true)).toEqual({ text: 'D+5', tone: 'overdue' })
  })

  it('주기 없는 항목은 지난 날을 센다', () => {
    expect(cycleBadge(state(47), false)).toEqual({ text: 'D+47', tone: 'normal' })
    expect(cycleBadge(state(0), false)).toEqual({ text: '오늘', tone: 'normal' })
  })

  it('기록이 없으면 그렇게 알려 준다', () => {
    expect(cycleBadge(state(null), true)).toEqual({ text: '기록 없음', tone: 'empty' })
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
