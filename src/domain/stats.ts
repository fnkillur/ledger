import type { Category, Kind, Person, Transaction } from './types'

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

export type PersonFilter = Person | '합산'

export const matchesPerson = (transaction: Transaction, filter: PersonFilter) =>
  filter === '합산' || transaction.person === filter

export type KindTotals = Record<Kind, number>

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
    .filter(transaction => transaction.kind === '지출' && transaction.source !== '이관' && isCounted(transaction, excludedCategories))
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
