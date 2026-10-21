import { describe, expect, it } from 'vitest'
import {
  budgetPace,
  categoryChanges,
  compareByPerson,
  elapsedMonthsOfYear,
  fixedVsVariable,
  noSpendCalendar,
  topMerchants,
  weekdayTimeMatrix,
} from './insights'
import type { Category, Transaction } from './types'

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  occurredAt: new Date(2026, 9, 10, 13).toISOString(),
  person: '쿠리만쥬',
  kind: '지출',
  amount: 10000,
  shareCount: 1,
  merchant: '',
  category: '식비',
  excluded: false,
  source: '알림',
  memo: '',
  rawText: '',
  deleted: false,
  updatedAt: '',
  ...overrides,
})

const none = new Set<string>()

describe('categoryChanges', () => {
  it('늘어난 순·줄어든 순으로 나누고 한쪽에만 있는 카테고리도 포함한다', () => {
    const { increased, decreased } = categoryChanges(
      [transaction({ category: '식비', amount: 50000 }), transaction({ category: '쇼핑', amount: 10000 })],
      [transaction({ category: '식비', amount: 20000 }), transaction({ category: '여행·숙박', amount: 300000 })],
      none,
    )

    expect(increased.map(item => [item.category, item.delta])).toEqual([
      ['식비', 30000],
      ['쇼핑', 10000],
    ])
    expect(decreased.map(item => [item.category, item.delta])).toEqual([['여행·숙박', -300000]])
  })
})

describe('fixedVsVariable', () => {
  it('고정비 카테고리 합과 나머지를 나눈다', () => {
    const categories: Category[] = [
      { kind: '지출', name: '주거·통신', order: 1, excluded: false, fixed: true, icon: '🏠' },
      { kind: '지출', name: '식비', order: 2, excluded: false, fixed: false, icon: '🍚' },
    ]

    const result = fixedVsVariable(
      [transaction({ category: '주거·통신', amount: 400000 }), transaction({ category: '식비', amount: 30000 }), transaction({ kind: '저축', category: '저축·투자', amount: 1000000 })],
      categories,
      none,
    )

    expect(result).toEqual({ fixed: 400000, variable: 30000 })
  })
})

describe('compareByPerson', () => {
  it('카테고리별로 두 사람의 내 몫을 합치고 총액 순으로 자른다', () => {
    const result = compareByPerson(
      [
        transaction({ category: '식비', amount: 30000 }),
        transaction({ category: '식비', person: '우사기', amount: 60000, shareCount: 2 }),
        transaction({ category: '쇼핑', person: '우사기', amount: 100000 }),
        transaction({ category: '카페·간식', amount: 5000 }),
      ],
      none,
      2,
    )

    expect(result).toEqual([
      { category: '쇼핑', 쿠리만쥬: 0, 우사기: 100000 },
      { category: '식비', 쿠리만쥬: 30000, 우사기: 30000 },
    ])
  })
})

describe('budgetPace', () => {
  it('이번 달은 하루 평균으로 월말 예상치를 낸다', () => {
    expect(budgetPace(1_000_000, '2026-10', new Date(2026, 9, 10, 15))).toEqual({
      projected: 3_100_000,
      elapsedDays: 10,
      totalDays: 31,
      isCurrent: true,
    })
  })

  it('지난 달은 실제 금액 그대로다', () => {
    expect(budgetPace(2_000_000, '2026-09', new Date(2026, 9, 10)).projected).toBe(2_000_000)
  })

  it('연도의 경과 개월 수', () => {
    const today = new Date(2026, 9, 21)
    expect([elapsedMonthsOfYear(2025, today), elapsedMonthsOfYear(2026, today), elapsedMonthsOfYear(2027, today)]).toEqual([12, 10, 0])
  })
})

describe('topMerchants', () => {
  it('이관 데이터를 빼고 방문 횟수 순으로 센다', () => {
    const result = topMerchants(
      [
        transaction({ merchant: '스타벅스', amount: 5000 }),
        transaction({ merchant: '스타벅스', amount: 6000 }),
        transaction({ merchant: '이마트', amount: 80000 }),
        transaction({ merchant: '월 합계', amount: 900000, source: '이관' }),
      ],
      none,
      5,
    )

    expect(result).toEqual([
      { merchant: '스타벅스', count: 2, amount: 11000 },
      { merchant: '이마트', count: 1, amount: 80000 },
    ])
  })
})

describe('weekdayTimeMatrix', () => {
  it('월요일 시작 요일 × 시간대 칸에 더한다', () => {
    const matrix = weekdayTimeMatrix(
      [
        transaction({ occurredAt: new Date(2026, 9, 19, 8).toISOString(), amount: 3000 }),
        transaction({ occurredAt: new Date(2026, 9, 25, 21).toISOString(), amount: 7000 }),
      ],
      none,
    )

    expect(matrix[0][1]).toBe(3000)
    expect(matrix[6][3]).toBe(7000)
  })
})

describe('noSpendCalendar', () => {
  it('오늘까지 지출 없는 날을 세고 달력 앞 빈칸을 계산한다', () => {
    const calendar = noSpendCalendar(
      [transaction({ occurredAt: new Date(2026, 9, 2, 12).toISOString() }), transaction({ occurredAt: new Date(2026, 9, 5, 12).toISOString() })],
      '2026-10',
      new Date(2026, 9, 5, 20),
      none,
    )

    expect(calendar.leadingBlanks).toBe(3)
    expect(calendar.noSpendCount).toBe(3)
    expect(calendar.days[5].isFuture).toBe(true)
  })
})
