import { describe, expect, it } from 'vitest'
import { addPeriod, cycleDueByDate, cycleState, dueOffsetToday, isLinkValid, sortCycles, type CycleItem, type CycleLog } from './cycle'
import type { Transaction } from './types'
import cases from './cycleCases.json'

type Case = { name: string; item: CycleItem; logs: CycleLog[]; transactions: Transaction[]; today: string; expected: Record<string, unknown> }

describe('addPeriod', () => {
  it('달·해 단위는 그 달 말일을 넘기지 않는다', () => {
    expect(addPeriod('2026-01-31', { amount: 1, unit: 'month' })).toBe('2026-02-28')
    expect(addPeriod('2028-02-29', { amount: 1, unit: 'year' })).toBe('2029-02-28')
    expect(addPeriod('2026-11-30', { amount: 3, unit: 'month' })).toBe('2027-02-28')
  })

  it('일·주 단위는 날수를 더한다', () => {
    expect(addPeriod('2026-11-04', { amount: 2, unit: 'week' })).toBe('2026-11-18')
    expect(addPeriod('2026-12-30', { amount: 3, unit: 'day' })).toBe('2027-01-02')
  })
})

describe('isLinkValid', () => {
  it('카테고리나 가맹점 말 중 하나는 있어야 한다', () => {
    expect(isLinkValid({ category: '', keyword: '', person: '우사기' })).toBe(false)
    expect(isLinkValid({ category: '', keyword: '  ', person: '' })).toBe(false)
    expect(isLinkValid({ category: '미용', keyword: '', person: '' })).toBe(true)
    expect(isLinkValid(null)).toBe(false)
  })
})

describe('cycleState · dueOffsetToday (앱·서버 공통 사례)', () => {
  ;(cases as unknown as Case[]).forEach(testCase => {
    it(testCase.name, () => {
      const state = cycleState(testCase.item, testCase.logs, testCase.transactions, testCase.today)
      expect({
        lastDate: state.lastDate,
        lastSource: state.lastSource,
        nextDate: state.nextDate,
        days: state.days,
        dueOffset: dueOffsetToday(testCase.item, state),
      }).toEqual(testCase.expected)
    })
  })

  it('결제로 잡힌 날은 가맹점을 함께 돌려준다', () => {
    const testCase = (cases as unknown as Case[])[1]
    expect(cycleState(testCase.item, testCase.logs, testCase.transactions, testCase.today).lastMerchant).toBe('연세치과')
  })
})

describe('sortCycles', () => {
  const row = (id: string, period: boolean, days: number | null) => ({
    item: { id, period: period ? { amount: 1, unit: 'month' } : null } as CycleItem,
    state: { lastDate: days === null ? null : 'x', lastSource: null, lastMerchant: '', nextDate: null, days },
  })

  it('기한이 가까운 순 → 기록 없는 항목 → 주기 없는 항목은 오래된 순', () => {
    const sorted = sortCycles([row('free-new', false, 3), row('soon', true, 5), row('none', true, null), row('late', true, -2), row('free-old', false, 90)])
    expect(sorted.map(item => item.item.id)).toEqual(['late', 'soon', 'none', 'free-old', 'free-new'])
  })
})

describe('cycleDueByDate', () => {
  const row = (id: string, period: boolean, nextDate: string | null) => ({
    item: { id, period: period ? { amount: 1, unit: 'month' } : null } as CycleItem,
    state: { lastDate: 'x', lastSource: 'log' as const, lastMerchant: '', nextDate, days: 0 },
  })

  it('주기 있는 항목의 다음 날짜에만 모은다', () => {
    const byDate = cycleDueByDate([row('a', true, '2026-11-07'), row('b', true, '2026-11-07'), row('c', true, null), row('d', false, null)])
    expect([...byDate.entries()].map(([date, items]) => [date, items.map(item => item.id)])).toEqual([['2026-11-07', ['a', 'b']]])
  })
})
