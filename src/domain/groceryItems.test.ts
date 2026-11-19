import { describe, expect, it } from 'vitest'
import { groceryItemRanking, groceryPurchases, priceChange, priceHistory } from './groceryItems'
import type { Transaction } from './types'

const transaction = (id: string, occurredAt: string, receiptItems: Transaction['receiptItems'], overrides: Partial<Transaction> = {}): Transaction => ({
  id,
  occurredAt,
  person: '쿠리만쥬',
  kind: '지출',
  amount: 10000,
  shareCount: 1,
  merchant: '롯데마트',
  category: '식재료',
  excluded: false,
  source: '수동',
  memo: '',
  rawText: '',
  deleted: false,
  updatedAt: occurredAt,
  scope: '공동',
  receiptItems,
  ...overrides,
})

const transactions = [
  transaction('a', '2026-10-02T03:00:00.000Z', [
    { name: '국산 두부', amount: 2500 },
    { name: '대파', amount: 3000 },
  ]),
  transaction('b', '2026-11-05T03:00:00.000Z', [{ name: '국산두부', amount: 2800 }], { merchant: '이마트' }),
  transaction('c', '2026-11-09T03:00:00.000Z', [
    { name: '국산 두부', amount: 5400, quantity: 2 },
    { name: '한우 등심', amount: 30000 },
  ]),
  transaction('deleted', '2026-11-10T03:00:00.000Z', [{ name: '대파', amount: 3000 }], { deleted: true }),
  transaction('no-receipt', '2026-11-11T03:00:00.000Z', undefined),
]

describe('groceryPurchases', () => {
  it('지운 내역은 빼고 영수증 품목을 한 줄씩 펼친다', () => {
    expect(groceryPurchases(transactions).map(purchase => `${purchase.name}:${purchase.merchant}`)).toEqual([
      '국산 두부:롯데마트',
      '대파:롯데마트',
      '국산두부:이마트',
      '국산 두부:롯데마트',
      '한우 등심:롯데마트',
    ])
  })
})

describe('groceryItemRanking', () => {
  const purchases = groceryPurchases(transactions)

  it('띄어쓰기만 다른 이름은 한 품목으로 묶고, 이름은 가장 최근 것을 쓴다. 횟수가 같으면 합계가 큰 품목부터', () => {
    expect(groceryItemRanking(purchases, '횟수순')).toEqual([
      { key: '국산두부', name: '국산 두부', count: 3, amount: 10700 },
      { key: '한우등심', name: '한우 등심', count: 1, amount: 30000 },
      { key: '대파', name: '대파', count: 1, amount: 3000 },
    ])
  })

  it('금액순은 합계가 큰 품목부터', () => {
    expect(groceryItemRanking(purchases, '금액순').map(item => item.key)).toEqual(['한우등심', '국산두부', '대파'])
  })
})

describe('priceHistory·priceChange', () => {
  const purchases = groceryPurchases(transactions)

  it('그 품목을 산 기록을 최신부터 모으고, 여러 개 샀으면 1개 가격으로 지난번과 비교한다', () => {
    const history = priceHistory(purchases, '국산두부')

    expect(history.map(purchase => [purchase.amount, purchase.quantity, purchase.unitPrice])).toEqual([
      [5400, 2, 2700],
      [2800, 1, 2800],
      [2500, 1, 2500],
    ])
    expect(priceChange(history)).toEqual({ difference: -100, percent: -4 })
  })

  it('한 번만 샀으면 비교하지 않는다', () => {
    expect(priceChange(priceHistory(purchases, '대파'))).toBeNull()
  })
})
