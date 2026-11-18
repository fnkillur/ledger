import { describe, expect, it } from 'vitest'
import { categoryDetail, merchantGroups, sortCategoryItems } from './categoryDetail'
import type { Transaction } from './types'

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  occurredAt: new Date(2026, 9, 10, 13).toISOString(),
  person: '쿠리만쥬',
  kind: '지출',
  amount: 10000,
  shareCount: 1,
  merchant: '',
  category: '카페',
  excluded: false,
  source: '알림',
  memo: '',
  rawText: '',
  deleted: false,
  updatedAt: '',
  scope: '공동',
  ...overrides,
})

const none = new Set<string>()

describe('categoryDetail', () => {
  it('통계에 잡히는 그 카테고리 지출만 모아 내 몫 총합·건수·평균을 낸다', () => {
    const detail = categoryDetail(
      [
        transaction({ merchant: '스타벅스', amount: 6000 }),
        transaction({ merchant: '메가커피', amount: 4000, shareCount: 2 }),
        transaction({ merchant: '투썸', amount: 9000, excluded: true }),
        transaction({ merchant: '투썸', amount: 9000, deleted: true }),
        transaction({ merchant: '김밥', amount: 5000, category: '식비' }),
        transaction({ merchant: '환불', amount: 3000, kind: '수입' }),
      ],
      '카페',
      none,
    )

    expect(detail.items.map(item => item.merchant)).toEqual(['스타벅스', '메가커피'])
    expect(detail).toMatchObject({ total: 8000, count: 2, average: 4000 })
  })
})

describe('sortCategoryItems', () => {
  const items = [
    transaction({ merchant: '작은 것', amount: 2000, occurredAt: new Date(2026, 9, 20).toISOString() }),
    transaction({ merchant: '큰 것', amount: 9000, occurredAt: new Date(2026, 9, 5).toISOString() }),
    transaction({ merchant: '나눈 것', amount: 12000, shareCount: 3, occurredAt: new Date(2026, 9, 12).toISOString() }),
  ]

  it('금액순은 내 몫이 큰 것부터 보여 준다', () => {
    expect(sortCategoryItems(items, '금액순').map(item => item.merchant)).toEqual(['큰 것', '나눈 것', '작은 것'])
  })

  it('최신순은 최근에 쓴 것부터 보여 준다', () => {
    expect(sortCategoryItems(items, '최신순').map(item => item.merchant)).toEqual(['작은 것', '나눈 것', '큰 것'])
  })
})

describe('merchantGroups', () => {
  it('가맹점별로 묶어 자주 간 곳부터, 횟수가 같으면 많이 쓴 곳부터 보여 준다', () => {
    const groups = merchantGroups([
      transaction({ merchant: '투썸', amount: 7000 }),
      transaction({ merchant: '스타벅스', amount: 5000 }),
      transaction({ merchant: '메가커피', amount: 2000 }),
      transaction({ merchant: '스타벅스', amount: 6000 }),
      transaction({ merchant: '메가커피', amount: 2000 }),
    ])

    expect(groups).toEqual([
      { merchant: '스타벅스', count: 2, amount: 11000 },
      { merchant: '메가커피', count: 2, amount: 4000 },
      { merchant: '투썸', count: 1, amount: 7000 },
    ])
  })

  it('가맹점 이름이 없는 것은 한데 모은다', () => {
    expect(merchantGroups([transaction({ merchant: '' }), transaction({ merchant: ' ' })])).toEqual([{ merchant: '가맹점 없음', count: 2, amount: 20000 }])
  })
})
