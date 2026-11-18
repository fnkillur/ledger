import { isCounted, myShare } from './stats'
import type { Transaction } from './types'

export const CATEGORY_SORTS = ['금액순', '횟수순', '최신순'] as const
export type CategorySort = (typeof CATEGORY_SORTS)[number]

const NO_MERCHANT = '가맹점 없음'

// 통계의 카테고리 금액과 맞도록, 통계에 잡히는 지출만 내 몫으로 센다.
export const categoryDetail = (transactions: Transaction[], category: string, excludedCategories: Set<string>) => {
  const items = transactions.filter(
    transaction => transaction.kind === '지출' && transaction.category === category && isCounted(transaction, excludedCategories),
  )
  const total = items.reduce((sum, transaction) => sum + myShare(transaction), 0)
  return { items, total, count: items.length, average: items.length > 0 ? Math.round(total / items.length) : 0 }
}

export const sortCategoryItems = (items: Transaction[], sort: Exclude<CategorySort, '횟수순'>) => {
  if (sort === '금액순') return [...items].sort((left, right) => myShare(right) - myShare(left))
  return [...items].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
}

// 같은 곳에 몇 번 갔는지 보려고 가맹점별로 묶는다.
export const merchantGroups = (items: Transaction[]) => {
  const groups = new Map<string, { merchant: string; count: number; amount: number }>()
  items.forEach(transaction => {
    const merchant = transaction.merchant.trim() || NO_MERCHANT
    const group = groups.get(merchant) ?? { merchant, count: 0, amount: 0 }
    groups.set(merchant, { merchant, count: group.count + 1, amount: group.amount + myShare(transaction) })
  })
  return [...groups.values()].sort((left, right) => right.count - left.count || right.amount - left.amount)
}
