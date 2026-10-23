import { isAggregate, PEOPLE, type Category, type Kind, type Person, type Transaction } from './types'

export const myShare = (transaction: Pick<Transaction, 'amount' | 'shareCount'>) =>
  Math.round(transaction.amount / Math.max(1, transaction.shareCount))

export const isCounted = (transaction: Transaction, excludedCategories: Set<string>) =>
  !transaction.deleted && !transaction.excluded && !excludedCategories.has(transaction.category)

export const toExcludedCategories = (categories: Category[]) =>
  new Set(categories.filter(category => category.excluded).map(category => category.name))

export const toMonthKey = (iso: string) => {
  const date = new Date(iso)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export type KindTotals = Record<Kind, number>

// 번 돈 대비 쓴 돈의 비율. 수입이 없으면 계산하지 않는다.
export const expenseRatio = (totals: Pick<KindTotals, '지출' | '수입'>) =>
  totals.수입 > 0 ? Math.round((totals.지출 / totals.수입) * 100) : null

export type RatioLevel = '여유' | '빠듯' | '초과'

// 번 돈의 70%까지는 여유, 100%까지는 빠듯, 그 이상은 번 것보다 더 쓴 달로 본다.
export const ratioLevel = (ratio: number): RatioLevel => {
  if (ratio > 100) return '초과'
  if (ratio > 70) return '빠듯'
  return '여유'
}

export const ratioMessage = (level: RatioLevel) => {
  if (level === '초과') return '번 것보다 더 썼어요'
  if (level === '빠듯') return '수입 대부분을 쓰고 있어요'
  return '수입 안에서 여유 있게 쓰고 있어요'
}

export const sumByKind = (transactions: Transaction[], excludedCategories: Set<string>): KindTotals =>
  transactions.reduce<KindTotals>(
    (totals, transaction) => {
      if (!isCounted(transaction, excludedCategories)) return totals
      return { ...totals, [transaction.kind]: totals[transaction.kind] + myShare(transaction) }
    },
    { 지출: 0, 수입: 0, 저축: 0 },
  )

export const sumByCategory = (transactions: Transaction[], kind: Kind, excludedCategories: Set<string>) => {
  const totals = new Map<string, number>()
  transactions.forEach(transaction => {
    if (transaction.kind !== kind || !isCounted(transaction, excludedCategories)) return
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + myShare(transaction))
  })
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .filter(item => item.amount !== 0)
    .sort((left, right) => right.amount - left.amount)
}

export const monthlyTotals = (transactions: Transaction[], monthKeys: string[], excludedCategories: Set<string>) =>
  monthKeys.map(monthKey => ({
    monthKey,
    ...sumByKind(
      transactions.filter(transaction => toMonthKey(transaction.occurredAt) === monthKey),
      excludedCategories,
    ),
  }))

export const recentMonthKeys = (endMonthKey: string, count: number) => {
  const [year, month] = endMonthKey.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - 1 - (count - 1 - index), 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
}

export const topExpenses = (transactions: Transaction[], excludedCategories: Set<string>, limit: number) =>
  transactions
    .filter(transaction => transaction.kind === '지출' && !isAggregate(transaction.source) && isCounted(transaction, excludedCategories))
    .sort((left, right) => myShare(right) - myShare(left))
    .slice(0, limit)

export type Slice = { label: string; amount: number; isOther: boolean }

export const toSlices = (categoryTotals: { category: string; amount: number }[], maxSlices: number): Slice[] => {
  const positive = categoryTotals.filter(item => item.amount > 0)
  if (positive.length <= maxSlices) return positive.map(item => ({ label: item.category, amount: item.amount, isOther: false }))
  const head = positive.slice(0, maxSlices - 1).map(item => ({ label: item.category, amount: item.amount, isOther: false }))
  const otherAmount = positive.slice(maxSlices - 1).reduce((sum, item) => sum + item.amount, 0)
  return [...head, { label: '기타', amount: otherAmount, isOther: true }]
}

export type ScopeFilter = '전체' | '공동' | Person

export const matchesScope = (transaction: Transaction, filter: ScopeFilter) => {
  if (filter === '전체') return true
  if (filter === '공동') return transaction.scope === '공동'
  return transaction.scope === '개인' && transaction.person === filter
}

export const expenseByScope = (transactions: Transaction[], excludedCategories: Set<string>) =>
  (['공동', ...PEOPLE] as const).map(filter => ({
    filter,
    amount: sumByKind(
      transactions.filter(transaction => matchesScope(transaction, filter)),
      excludedCategories,
    ).지출,
  }))
