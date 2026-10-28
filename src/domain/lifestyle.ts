import { isCounted, myShare, toMonthKey } from './stats'
import { isAggregate, type Transaction } from './types'

export const GROCERY_CATEGORY = '편의점·마트·잡화'
export const MEAL_CATEGORY = '식비'
export const SEASONAL_CATEGORIES = ['여행·숙박', '쇼핑'] as const
export type SeasonalCategory = (typeof SEASONAL_CATEGORIES)[number]

const DELIVERY_KEYWORDS = ['배달의민족', '배민', '요기요', '쿠팡이츠', '땡겨요']

// 배달은 건별 기록의 가맹점 이름으로만 알 수 있다. 월 합계로 옮겨 온 식비는 모두 외식으로 본다.
const isDelivery = (transaction: Transaction) =>
  !isAggregate(transaction.source) && DELIVERY_KEYWORDS.some(keyword => transaction.merchant.replace(/\s+/g, '').includes(keyword))

export type MealSplit = { grocery: number; delivery: number; dining: number }

export const mealSplit = (transactions: Transaction[], excludedCategories: Set<string>): MealSplit =>
  transactions.reduce<MealSplit>(
    (split, transaction) => {
      if (transaction.kind !== '지출' || !isCounted(transaction, excludedCategories)) return split
      const amount = myShare(transaction)
      if (transaction.category === GROCERY_CATEGORY) return { ...split, grocery: split.grocery + amount }
      if (transaction.category !== MEAL_CATEGORY) return split
      return isDelivery(transaction) ? { ...split, delivery: split.delivery + amount } : { ...split, dining: split.dining + amount }
    },
    { grocery: 0, delivery: 0, dining: 0 },
  )

// 장보기 대비 밖에서 먹은 돈(배달 + 외식)의 비율. 둘 다 없으면 null.
export const eatingOutShare = (split: MealSplit) => {
  const total = split.grocery + split.delivery + split.dining
  return total === 0 ? null : Math.round(((split.delivery + split.dining) / total) * 100)
}

export const monthlyMealSplits = (transactions: Transaction[], monthKeys: string[], excludedCategories: Set<string>) =>
  monthKeys.map(monthKey => ({
    monthKey,
    ...mealSplit(
      transactions.filter(transaction => toMonthKey(transaction.occurredAt) === monthKey),
      excludedCategories,
    ),
  }))

export type SeasonalSeries = { year: number; amounts: number[] }

// 연도마다 1~12월 금액. 기록이 하나도 없는 해는 뺀다.
export const seasonalByMonth = (transactions: Transaction[], category: string, excludedCategories: Set<string>): SeasonalSeries[] => {
  const byYear = new Map<number, number[]>()
  transactions.forEach(transaction => {
    if (transaction.kind !== '지출' || transaction.category !== category || !isCounted(transaction, excludedCategories)) return
    const date = new Date(transaction.occurredAt)
    const amounts = byYear.get(date.getFullYear()) ?? Array.from({ length: 12 }, () => 0)
    amounts[date.getMonth()] += myShare(transaction)
    byYear.set(date.getFullYear(), amounts)
  })
  return [...byYear.entries()].sort(([left], [right]) => left - right).map(([year, amounts]) => ({ year, amounts }))
}

// 여러 해를 합쳐 가장 많이 쓴 달(1~12). 기록이 없으면 null.
export const peakMonth = (series: SeasonalSeries[]) => {
  const totals = Array.from({ length: 12 }, (_, month) => series.reduce((sum, row) => sum + row.amounts[month], 0))
  const max = Math.max(...totals)
  return max > 0 ? totals.indexOf(max) + 1 : null
}
