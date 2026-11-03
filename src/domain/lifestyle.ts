import { isCounted, myShare, toMonthKey } from './stats'
import type { Transaction } from './types'

export const SEASONAL_CATEGORIES = ['여행·숙박', '쇼핑'] as const
export type SeasonalCategory = (typeof SEASONAL_CATEGORIES)[number]

// 2026년 11월부터 식재료·외식·배달을 카테고리로 나눠 기록한다. 그 전 달은 편의점·마트·잡화와 식비 합계뿐이라 나눌 수 없다.
export const MEAL_START_MONTH = '2026-11'
const MEAL_PART_BY_CATEGORY: Record<string, keyof MealSplit> = { 식재료: 'grocery', 배달: 'delivery', 외식: 'dining' }

export type MealSplit = { grocery: number; delivery: number; dining: number }

export const mealSplit = (transactions: Transaction[], excludedCategories: Set<string>): MealSplit =>
  transactions.reduce<MealSplit>(
    (split, transaction) => {
      const part = MEAL_PART_BY_CATEGORY[transaction.category]
      if (!part || transaction.kind !== '지출' || !isCounted(transaction, excludedCategories)) return split
      if (toMonthKey(transaction.occurredAt) < MEAL_START_MONTH) return split
      return { ...split, [part]: split[part] + myShare(transaction) }
    },
    { grocery: 0, delivery: 0, dining: 0 },
  )

// 집밥 대비 밖에서 먹은 돈(배달 + 외식)의 비율. 둘 다 없으면 null.
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
