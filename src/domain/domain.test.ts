import { describe, expect, it } from 'vitest'
import { evaluateAmount } from './amountExpression'
import { classifyMerchant } from './classify'
import { isSamePayment, parsePaymentNotification, type CapturedNotification } from './notificationParser'
import { expenseByScope, matchesScope, monthlyTotals, myShare, recentMonthKeys, sumByCategory, sumByKind, toSlices, topExpenses } from './stats'
import type { Transaction } from './types'

describe('evaluateAmount', () => {
  it.each([
    ['12,000', 12000],
    ['5616746-113766', 5502980],
    ['=700000/3', 233333],
    ['400000+58680+190000+27710', 676390],
    ['(1000+2000)*2', 6000],
    ['3,000원', 3000],
  ])('%s → %d', (expression, expected) => {
    expect(evaluateAmount(expression)).toBe(expected)
  })

  it.each(['', 'abc', '1000-', '(100', 'alert(1)'])('잘못된 식 %s → null', expression => {
    expect(evaluateAmount(expression)).toBeNull()
  })
})

const notification = (title: string, text: string): CapturedNotification => ({
  key: 'k',
  packageName: 'com.example',
  appLabel: '예시',
  title,
  text,
  postedAt: Date.parse('2026-10-21T03:00:00.000Z'),
})

describe('parsePaymentNotification', () => {
  it('결제 알림에서 금액·구분·가맹점을 뽑는다', () => {
    const parsed = parsePaymentNotification(notification('토스', '스타벅스에서 5,300원 결제했어요'))

    expect(parsed).toMatchObject({ kind: '지출', amount: 5300, merchant: '스타벅스', isCancel: false })
  })

  it('누적·잔액 금액은 건너뛴다', () => {
    const parsed = parsePaymentNotification(notification('신한카드', '누적 1,200,000원 승인 12,000원 일시불'))

    expect(parsed?.amount).toBe(12000)
  })

  it('입금은 수입으로 본다', () => {
    expect(parsePaymentNotification(notification('은행', '홍길동님이 50,000원 입금'))?.kind).toBe('수입')
  })

  it('취소 알림을 표시한다', () => {
    expect(parsePaymentNotification(notification('카드', '승인취소 8,000원'))?.isCancel).toBe(true)
  })

  it('결제와 무관한 알림은 무시한다', () => {
    expect(parsePaymentNotification(notification('쇼핑몰', '지금 가입하면 5,000원 쿠폰'))).toBeNull()
  })

  it('결제 단어가 있어도 광고성 알림은 무시한다', () => {
    expect(parsePaymentNotification(notification('결제', '(광고) 첫 결제 시 5,000원 할인 쿠폰'))).toBeNull()
  })
})

describe('isSamePayment', () => {
  const base = { kind: '지출' as const, amount: 5300, occurredAt: '2026-10-21T03:00:00.000Z' }

  it('2분 안의 같은 금액은 같은 거래다', () => {
    expect(isSamePayment(base, { ...base, occurredAt: '2026-10-21T03:01:30.000Z' })).toBe(true)
  })

  it('시간이 멀거나 금액이 다르면 다른 거래다', () => {
    expect(isSamePayment(base, { ...base, occurredAt: '2026-10-21T03:05:00.000Z' })).toBe(false)
    expect(isSamePayment(base, { ...base, amount: 5400 })).toBe(false)
  })
})

describe('classifyMerchant', () => {
  const rules = [
    { keyword: '스타벅스', category: '카페·간식', updatedAt: '' },
    { keyword: '쿠팡', category: '쇼핑', updatedAt: '' },
    { keyword: '쿠팡이츠', category: '식비', updatedAt: '' },
  ]

  it('키워드가 포함된 가맹점을 분류하고 더 긴 키워드를 우선한다', () => {
    expect(classifyMerchant('스타벅스 강남점', rules)).toBe('카페·간식')
    expect(classifyMerchant('쿠팡이츠', rules)).toBe('식비')
    expect(classifyMerchant('쿠팡(주)', rules)).toBe('쇼핑')
  })

  it('맞는 규칙이 없으면 null', () => {
    expect(classifyMerchant('동네빵집', rules)).toBeNull()
  })
})

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  occurredAt: '2026-10-10T03:00:00.000Z',
  person: '쿠리만쥬',
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

describe('stats', () => {
  const excluded = new Set(['정산'])

  it('나눠 낸 거래는 내 몫만 센다', () => {
    expect(myShare({ amount: 700000, shareCount: 3 })).toBe(233333)
  })

  it('구분별 합계에서 삭제·통계 제외·제외 카테고리를 뺀다', () => {
    const totals = sumByKind(
      [
        transaction({ amount: 30000, shareCount: 3 }),
        transaction({ kind: '수입', category: '월급', amount: 5000000 }),
        transaction({ kind: '수입', category: '정산', amount: 20000 }),
        transaction({ kind: '저축', category: '저축·투자', amount: 1000000 }),
        transaction({ amount: 99999, deleted: true }),
        transaction({ amount: 88888, excluded: true }),
      ],
      excluded,
    )

    expect(totals).toEqual({ 지출: 10000, 수입: 5000000, 저축: 1000000 })
  })

  it('카테고리별 합계를 큰 순서로 정렬하고 취소 금액을 차감한다', () => {
    const result = sumByCategory(
      [
        transaction({ category: '식비', amount: 10000 }),
        transaction({ category: '쇼핑', amount: 50000 }),
        transaction({ category: '쇼핑', amount: -20000 }),
      ],
      '지출',
      excluded,
    )

    expect(result).toEqual([
      { category: '쇼핑', amount: 30000 },
      { category: '식비', amount: 10000 },
    ])
  })

  it('최근 N개월 키를 연도를 넘어 만든다', () => {
    expect(recentMonthKeys('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('월별 합계를 만든다', () => {
    const result = monthlyTotals([transaction({ occurredAt: '2026-10-10T03:00:00.000Z' })], ['2026-09', '2026-10'], excluded)

    expect(result.map(item => item.지출)).toEqual([0, 10000])
  })
})

describe('topExpenses · toSlices', () => {
  it('이관된 월 합계와 제외 항목을 빼고 내 몫 기준으로 큰 지출을 고른다', () => {
    const result = topExpenses(
      [
        transaction({ merchant: '월 합계', amount: 900000, source: '이관' }),
        transaction({ merchant: '여행', amount: 600000, shareCount: 3 }),
        transaction({ merchant: '가전', amount: 300000 }),
        transaction({ merchant: '대신 결제', amount: 500000, excluded: true }),
        transaction({ kind: '수입', category: '월급', amount: 5000000 }),
      ],
      new Set(),
      5,
    )

    expect(result.map(item => item.merchant)).toEqual(['가전', '여행'])
  })

  it('조각이 많으면 상위 N-1개와 기타로 묶는다', () => {
    const totals = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((category, index) => ({ category, amount: 70 - index * 10 }))

    expect(toSlices(totals, 6)).toEqual([
      { label: 'a', amount: 70, isOther: false },
      { label: 'b', amount: 60, isOther: false },
      { label: 'c', amount: 50, isOther: false },
      { label: 'd', amount: 40, isOther: false },
      { label: 'e', amount: 30, isOther: false },
      { label: '기타', amount: 30, isOther: true },
    ])
    expect(toSlices(totals.slice(0, 3), 6)).toHaveLength(3)
  })
})

describe('공동·개인', () => {
  const items = [
    transaction({ amount: 50000, scope: '공동' }),
    transaction({ amount: 20000, scope: '개인', person: '쿠리만쥬' }),
    transaction({ amount: 30000, scope: '개인', person: '우사기' }),
    transaction({ amount: 10000, scope: '공동', person: '우사기' }),
  ]

  it('범위 필터는 공동이면 결제자와 상관없이, 개인이면 그 사람 것만 고른다', () => {
    expect(items.filter(item => matchesScope(item, '공동')).map(item => item.amount)).toEqual([50000, 10000])
    expect(items.filter(item => matchesScope(item, '우사기')).map(item => item.amount)).toEqual([30000])
    expect(items.filter(item => matchesScope(item, '전체'))).toHaveLength(4)
  })

  it('지출을 공동·각자 개인으로 나눈다', () => {
    expect(expenseByScope(items, new Set())).toEqual([
      { filter: '공동', amount: 60000 },
      { filter: '쿠리만쥬', amount: 20000 },
      { filter: '우사기', amount: 30000 },
    ])
  })
})
