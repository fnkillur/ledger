import { describe, expect, it } from 'vitest'
import { addPeriod, cycleDueByDate, cycleFromEvent, cycleState, findCycleForEvent, splitCycles, visibleCycles, type CycleEvent, type CycleItem, type CycleState } from './cycle'
import cases from './cycleCases.json'

type Case = { name: string; item: CycleItem; events: CycleEvent[]; today: string; expected: Record<string, unknown> }

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

describe('findCycleForEvent', () => {
  const item = (overrides: Partial<CycleItem>) => ({ id: 'c', name: '치과', target: '우사기', keyword: '', deleted: false, ...overrides }) as CycleItem

  it('일정 제목·대상에 맞는 첫 주기 항목을 찾는다', () => {
    const items = [item({ id: 'mine', target: '쿠리만쥬' }), item({ id: 'yours' })]
    expect(findCycleForEvent(items, { title: '치과 예약', start: '2026-11-20', target: '우사기' })?.id).toBe('yours')
  })

  it('지운 항목과 맞지 않는 일정은 없다고 한다', () => {
    expect(findCycleForEvent([item({ deleted: true })], { title: '치과', start: '2026-11-20', target: '우사기' })).toBeNull()
    expect(findCycleForEvent([item({})], { title: '미용실', start: '2026-11-20', target: '우사기' })).toBeNull()
  })
})

describe('cycleFromEvent', () => {
  it('일정 제목을 이름·키워드로, 일정 대상을 항목 대상으로 쓴다(지정일은 공동)', () => {
    expect(cycleFromEvent('  피부과 ', '우사기')).toMatchObject({ name: '피부과', keyword: '피부과', target: '우사기', period: null })
    expect(cycleFromEvent('필터 교체', '없음').target).toBe('공동')
  })
})

describe('cycleState (앱·서버 공통 사례)', () => {
  ;(cases as unknown as Case[]).forEach(testCase => {
    it(testCase.name, () => {
      const state = cycleState(testCase.item, testCase.events, testCase.today)
      expect(state).toEqual(testCase.expected)
    })
  })
})

describe('visibleCycles', () => {
  const row = (id: string, target: CycleItem['target']) => ({ item: { id, target } as CycleItem })
  const rows = [row('shared', '공동'), row('mine', '쿠리만쥬'), row('yours', '우사기')]

  it('공동과 내 항목만 보이고, 상대방 것도 보기를 켜면 모두 보인다', () => {
    expect(visibleCycles(rows, '쿠리만쥬', false).map(item => item.item.id)).toEqual(['shared', 'mine'])
    expect(visibleCycles(rows, '우사기', false).map(item => item.item.id)).toEqual(['shared', 'yours'])
    expect(visibleCycles(rows, '쿠리만쥬', true)).toHaveLength(3)
  })
})

describe('splitCycles', () => {
  const state = (days: number | null): CycleState => ({ lastDate: days === null ? null : 'x', reservation: null, nextDate: null, isReservedNext: false, days })
  const row = (id: string, period: boolean, days: number | null) => ({ item: { id, period: period ? { amount: 1, unit: 'month' } : null } as CycleItem, state: state(days) })

  it('주기 있는 항목은 기한이 가까운 순(기록 없으면 뒤), 주기 없는 항목은 오래된 순(기록 없으면 뒤)으로 나눈다', () => {
    const { periodic, elapsed } = splitCycles([
      row('free-new', false, 3),
      row('soon', true, 5),
      row('none', true, null),
      row('late', true, -2),
      row('free-old', false, 90),
      row('free-none', false, null),
    ])
    expect(periodic.map(item => item.item.id)).toEqual(['late', 'soon', 'none'])
    expect(elapsed.map(item => item.item.id)).toEqual(['free-old', 'free-new', 'free-none'])
  })

  it('주기 없는 항목은 예약이 있어도 마지막으로 한 지에 둔다', () => {
    const reserved = { item: { id: 'dentist', period: null } as unknown as CycleItem, state: { ...state(119), lastDate: '2026-07-08', reservation: '2026-11-20' } }
    const { periodic, elapsed } = splitCycles([reserved, row('soon', true, 5)])

    expect(periodic.map(item => item.item.id)).toEqual(['soon'])
    expect(elapsed.map(item => item.item.id)).toEqual(['dentist'])
  })
})

describe('cycleDueByDate', () => {
  const row = (id: string, period: boolean, nextDate: string | null) => ({
    item: { id, period: period ? { amount: 1, unit: 'month' } : null } as CycleItem,
    state: { lastDate: 'x', reservation: null, nextDate, isReservedNext: false, days: 0 },
  })

  it('주기 있는 항목의 다음 날짜에만 모은다', () => {
    const byDate = cycleDueByDate([row('a', true, '2026-11-07'), row('b', true, '2026-11-07'), row('c', true, null), row('d', false, null)])
    expect([...byDate.entries()].map(([date, items]) => [date, items.map(item => item.id)])).toEqual([['2026-11-07', ['a', 'b']]])
  })
})
