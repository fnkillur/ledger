import { isCounted, myShare, sumByCategory, toMonthKey } from './stats'
import { isAggregate, UNCATEGORIZED, type Category, type Kind, type Person, type Transaction } from './types'

const isDetailedExpense = (transaction: Transaction, excludedCategories: Set<string>) =>
  transaction.kind === '지출' && !isAggregate(transaction.source) && isCounted(transaction, excludedCategories)

export const hasDetailedData = (transactions: Transaction[]) =>
  transactions.some(transaction => !isAggregate(transaction.source) && !transaction.deleted)

export type CategoryChange = { category: string; current: number; previous: number; delta: number }

export const categoryChanges = (current: Transaction[], previous: Transaction[], excludedCategories: Set<string>) => {
  const currentTotals = new Map(sumByCategory(current, '지출', excludedCategories).map(item => [item.category, item.amount]))
  const previousTotals = new Map(sumByCategory(previous, '지출', excludedCategories).map(item => [item.category, item.amount]))
  const categories = new Set([...currentTotals.keys(), ...previousTotals.keys()])

  const changes: CategoryChange[] = [...categories].map(category => {
    const currentAmount = currentTotals.get(category) ?? 0
    const previousAmount = previousTotals.get(category) ?? 0
    return { category, current: currentAmount, previous: previousAmount, delta: currentAmount - previousAmount }
  })

  return {
    increased: changes.filter(change => change.delta > 0).sort((left, right) => right.delta - left.delta),
    decreased: changes.filter(change => change.delta < 0).sort((left, right) => left.delta - right.delta),
  }
}

export const fixedVsVariable = (transactions: Transaction[], categories: Category[], excludedCategories: Set<string>) => {
  const fixedNames = new Set(categories.filter(category => category.fixed).map(category => category.name))
  return sumByCategory(transactions, '지출', excludedCategories).reduce(
    (totals, item) => (fixedNames.has(item.category) ? { ...totals, fixed: totals.fixed + item.amount } : { ...totals, variable: totals.variable + item.amount }),
    { fixed: 0, variable: 0 },
  )
}

export type PersonComparison = { category: string } & Record<Person, number>

export const compareByPerson = (transactions: Transaction[], excludedCategories: Set<string>, limit: number) => {
  const totals = new Map<string, PersonComparison>()
  transactions.forEach(transaction => {
    if (transaction.kind !== '지출' || transaction.scope !== '개인' || !isCounted(transaction, excludedCategories)) return
    const row = totals.get(transaction.category) ?? { category: transaction.category, 쿠리만쥬: 0, 우사기: 0 }
    row[transaction.person] += myShare(transaction)
    totals.set(transaction.category, row)
  })
  return [...totals.values()]
    .filter(row => row.쿠리만쥬 + row.우사기 > 0)
    .sort((left, right) => right.쿠리만쥬 + right.우사기 - (left.쿠리만쥬 + left.우사기))
    .slice(0, limit)
}

const daysInMonth = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month, 0).getDate()
}

// 이번 달이면 지금까지의 하루 평균으로 월말 예상치를 낸다. 지난 달은 실제 금액이 곧 결과다.
export const budgetPace = (spent: number, monthKey: string, today: Date) => {
  const totalDays = daysInMonth(monthKey)
  if (toMonthKey(today.toISOString()) !== monthKey) return { projected: spent, elapsedDays: totalDays, totalDays, isCurrent: false }
  const elapsedDays = today.getDate()
  return { projected: Math.round((spent / elapsedDays) * totalDays), elapsedDays, totalDays, isCurrent: true }
}

export const elapsedMonthsOfYear = (year: number, today: Date) => {
  if (year < today.getFullYear()) return 12
  if (year > today.getFullYear()) return 0
  return today.getMonth() + 1
}

export type MerchantStat = { merchant: string; count: number; amount: number }

export const topMerchants = (transactions: Transaction[], excludedCategories: Set<string>, limit: number) => {
  const stats = new Map<string, MerchantStat>()
  transactions.forEach(transaction => {
    const merchant = transaction.merchant.trim()
    if (!merchant || !isDetailedExpense(transaction, excludedCategories)) return
    const stat = stats.get(merchant) ?? { merchant, count: 0, amount: 0 }
    // 결제 취소(음수)는 방문이 아니라 환불이라 금액에서만 뺀다.
    const visits = transaction.amount > 0 ? 1 : 0
    stats.set(merchant, { ...stat, count: stat.count + visits, amount: stat.amount + myShare(transaction) })
  })
  return [...stats.values()]
    .filter(stat => stat.count > 0 && stat.amount > 0)
    .sort((left, right) => right.count - left.count || right.amount - left.amount)
    .slice(0, limit)
}

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
export const TIME_SLOTS = [
  { label: '새벽', from: 0 },
  { label: '오전', from: 6 },
  { label: '오후', from: 12 },
  { label: '저녁', from: 18 },
]

const toSlotIndex = (hour: number) => TIME_SLOTS.findLastIndex(slot => hour >= slot.from)

export const weekdayTimeMatrix = (transactions: Transaction[], excludedCategories: Set<string>) => {
  const matrix = WEEKDAYS.map(() => TIME_SLOTS.map(() => 0))
  transactions.forEach(transaction => {
    if (!isDetailedExpense(transaction, excludedCategories)) return
    const date = new Date(transaction.occurredAt)
    const weekday = (date.getDay() + 6) % 7
    matrix[weekday][toSlotIndex(date.getHours())] += myShare(transaction)
  })
  return matrix
}

export type CalendarDay = { day: number; spent: number; isFuture: boolean }

export const noSpendCalendar = (transactions: Transaction[], monthKey: string, today: Date, excludedCategories: Set<string>) => {
  const [year, month] = monthKey.split('-').map(Number)
  const spentByDay = new Map<number, number>()
  transactions.forEach(transaction => {
    if (!isDetailedExpense(transaction, excludedCategories) || toMonthKey(transaction.occurredAt) !== monthKey) return
    const day = new Date(transaction.occurredAt).getDate()
    spentByDay.set(day, (spentByDay.get(day) ?? 0) + myShare(transaction))
  })

  const days: CalendarDay[] = Array.from({ length: daysInMonth(monthKey) }, (_, index) => ({
    day: index + 1,
    spent: spentByDay.get(index + 1) ?? 0,
    isFuture: new Date(year, month - 1, index + 1) > today,
  }))

  return {
    days,
    leadingBlanks: (new Date(year, month - 1, 1).getDay() + 6) % 7,
    noSpendCount: days.filter(day => !day.isFuture && day.spent <= 0).length,
  }
}

export type FrequentEntry = Pick<Transaction, 'merchant' | 'amount' | 'category' | 'scope'>

// 두 번 이상 쓴 가맹점만 골라, 가장 최근에 쓴 금액·카테고리로 바로 채울 수 있게 한다.
export const frequentEntries = (transactions: Transaction[], kind: Kind, limit: number): FrequentEntry[] => {
  const groups = new Map<string, { entry: FrequentEntry; count: number }>()
  ;[...transactions]
    .filter(
      transaction =>
        !transaction.deleted &&
        !isAggregate(transaction.source) &&
        transaction.kind === kind &&
        transaction.amount > 0 &&
        transaction.merchant.trim() !== '' &&
        transaction.category !== '' &&
        transaction.category !== UNCATEGORIZED,
    )
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .forEach(transaction => {
      const merchant = transaction.merchant.trim()
      const group = groups.get(merchant)
      if (group) {
        group.count++
        return
      }
      groups.set(merchant, { entry: { merchant, amount: transaction.amount, category: transaction.category, scope: transaction.scope }, count: 1 })
    })
  return [...groups.values()]
    .filter(group => group.count >= 2)
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
    .map(group => group.entry)
}
