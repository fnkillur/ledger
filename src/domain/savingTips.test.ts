import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from './defaultCategories'
import { savingTips } from './savingTips'
import type { Transaction } from './types'

let sequence = 0
const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: `t${sequence++}`,
  occurredAt: new Date(2026, 8, 10, 13).toISOString(),
  person: '우사기',
  kind: '지출',
  amount: 10000,
  shareCount: 1,
  merchant: '',
  category: '식비',
  excluded: false,
  source: '수동',
  memo: '',
  rawText: '',
  deleted: false,
  updatedAt: '',
  scope: '공동',
  ...overrides,
})

const at = (month: number, day: number, hour = 13) => new Date(2026, month - 1, day, hour).toISOString()
const TODAY = new Date(2026, 9, 23)

const run = (transactions: Transaction[], monthKey = '2026-09') =>
  savingTips({ monthKey, transactions, categories: DEFAULT_CATEGORIES, today: TODAY, limit: 6 })

describe('savingTips', () => {
  it('선택 소비가 수입의 30%를 넘으면 50/30/20 기준으로 알려준다', () => {
    const tips = run([
      tx({ kind: '수입', category: '월급', amount: 1000000, occurredAt: at(9, 1) }),
      tx({ category: '쇼핑', amount: 250000, source: '월합계', occurredAt: at(9, 1, 12) }),
      tx({ category: '카페·간식', amount: 150000, source: '월합계', occurredAt: at(9, 1, 12) }),
    ])

    expect(tips.find(tip => tip.id === 'wants')).toMatchObject({ title: '선택 소비가 수입의 40%예요', amount: 100000 })
  })

  it('최근 3달 평균보다 크게 늘어난 카테고리 하나를 고른다', () => {
    const history = [6, 7, 8].map(month => tx({ category: '카페·간식', amount: 100000, source: '월합계', occurredAt: at(month, 1, 12) }))
    const tips = run([...history, tx({ category: '카페·간식', amount: 180000, source: '월합계', occurredAt: at(9, 1, 12) })])

    expect(tips.find(tip => tip.id === 'spike')).toMatchObject({ title: '카페·간식 지출이 평소보다 80,000원 많아요', amount: 80000 })
  })

  it('1만 원 이하 소액 결제, 배달, 밤 11시 이후 결제를 건별 내역에서 센다', () => {
    const small = Array.from({ length: 8 }, (_, index) => tx({ amount: 5000, merchant: `편의점${index}`, occurredAt: at(9, index + 1) }))
    const delivery = Array.from({ length: 3 }, (_, index) => tx({ amount: 30000, merchant: '배달의민족', occurredAt: at(9, index + 10, 23) }))
    const ids = run([...small, ...delivery]).map(tip => tip.id)

    expect(ids).toEqual(expect.arrayContaining(['small', 'delivery', 'lateNight']))
  })

  it('두 달 이상 같은 곳에서 같은 금액이 나가면 정기 결제로 묶고, 고정비 카테고리는 뺀다', () => {
    const tips = run([
      tx({ merchant: '넷플릭스', amount: 17000, category: '취미·여가', occurredAt: at(8, 5) }),
      tx({ merchant: '넷플릭스', amount: 17000, category: '취미·여가', occurredAt: at(9, 5) }),
      tx({ merchant: '관리비', amount: 240000, category: '주거·통신', occurredAt: at(8, 21) }),
      tx({ merchant: '관리비', amount: 240000, category: '주거·통신', occurredAt: at(9, 21) }),
    ])

    expect(tips.find(tip => tip.id === 'recurring')).toMatchObject({ title: '매달 나가는 결제 1건, 월 17,000원' })
  })

  it('아낄 수 있는 금액이 큰 순서로 정렬하고, 해당 없으면 빈 목록', () => {
    expect(run([tx({ amount: 50000, occurredAt: at(9, 3) })])).toEqual([])
  })
})
