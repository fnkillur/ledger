import { describe, expect, it } from 'vitest'
import { eatingOutShare, mealSplit, monthlyMealSplits, peakMonth, seasonalByMonth } from './lifestyle'
import type { Transaction } from './types'

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  occurredAt: new Date(2026, 10, 10, 13).toISOString(),
  person: '쿠리만쥬',
  kind: '지출',
  amount: 10000,
  shareCount: 1,
  merchant: '',
  category: '외식',
  excluded: false,
  source: '알림',
  memo: '',
  rawText: '',
  deleted: false,
  updatedAt: '',
  scope: '공동',
  ...overrides,
})

describe('mealSplit', () => {
  it('식재료·배달·외식 카테고리로 나눈다', () => {
    const split = mealSplit(
      [
        transaction({ category: '식재료', amount: 30000 }),
        transaction({ category: '배달', amount: 25000 }),
        transaction({ category: '외식', amount: 8000 }),
        transaction({ category: '편의점·마트·잡화', amount: 40000 }),
        transaction({ category: '외식', amount: 6000, shareCount: 2 }),
        transaction({ category: '외식', amount: 1000, excluded: true }),
      ],
      new Set(),
    )
    expect(split).toEqual({ grocery: 30000, delivery: 25000, dining: 11000 })
    expect(eatingOutShare(split)).toBe(55)
  })

  it('2026년 11월 전 기록은 나눌 수 없어서 세지 않는다', () => {
    expect(mealSplit([transaction({ category: '외식', occurredAt: new Date(2026, 9, 31).toISOString() })], new Set())).toEqual({
      grocery: 0,
      delivery: 0,
      dining: 0,
    })
  })

  it('먹는 데 쓴 돈이 없으면 비율은 없다', () => {
    expect(eatingOutShare({ grocery: 0, delivery: 0, dining: 0 })).toBeNull()
  })

  it('달마다 나눈다', () => {
    const rows = monthlyMealSplits(
      [transaction({ category: '식재료' }), transaction({ occurredAt: new Date(2026, 11, 3).toISOString() })],
      ['2026-11', '2026-12'],
      new Set(),
    )
    expect(rows).toEqual([
      { monthKey: '2026-11', grocery: 10000, delivery: 0, dining: 0 },
      { monthKey: '2026-12', grocery: 0, delivery: 0, dining: 10000 },
    ])
  })
})

describe('seasonalByMonth', () => {
  it('해마다 1~12월 금액을 모으고, 가장 많이 쓴 달을 찾는다', () => {
    const series = seasonalByMonth(
      [
        transaction({ category: '여행·숙박', occurredAt: new Date(2025, 7, 1).toISOString(), amount: 500000 }),
        transaction({ category: '여행·숙박', occurredAt: new Date(2026, 1, 1).toISOString(), amount: 200000 }),
        transaction({ category: '여행·숙박', occurredAt: new Date(2026, 7, 1).toISOString(), amount: 100000 }),
        transaction({ category: '쇼핑', occurredAt: new Date(2026, 1, 1).toISOString(), amount: 900000 }),
      ],
      '여행·숙박',
      new Set(),
    )
    expect(series.map(row => row.year)).toEqual([2025, 2026])
    expect(series[0].amounts[7]).toBe(500000)
    expect(series[1].amounts[1]).toBe(200000)
    expect(peakMonth(series)).toBe(8)
    expect(peakMonth([])).toBeNull()
  })
})
