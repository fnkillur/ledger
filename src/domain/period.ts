export type Period = { type: '월별' | '연도별'; monthKey: string }

export const EARLIEST_MONTH_KEY = '2025-01'

export type PeriodRange = { start: string; end: string }

const pad = (value: number) => String(value).padStart(2, '0')

const parseMonthKey = (monthKey: string) => monthKey.split('-').map(Number) as [number, number]

export const toRange = ({ type, monthKey }: Period): PeriodRange => {
  const [year, month] = parseMonthKey(monthKey)
  if (type === '연도별') {
    return { start: new Date(year, 0, 1).toISOString(), end: new Date(year + 1, 0, 1).toISOString() }
  }
  return { start: new Date(year, month - 1, 1).toISOString(), end: new Date(year, month, 1).toISOString() }
}

export const shiftPeriod = ({ type, monthKey }: Period, offset: number): Period => {
  const [year, month] = parseMonthKey(monthKey)
  const date = new Date(year, month - 1 + (type === '연도별' ? offset * 12 : offset), 1)
  return { type, monthKey: `${date.getFullYear()}-${pad(date.getMonth() + 1)}` }
}

export const formatPeriod = ({ type, monthKey }: Period) => {
  const [year, month] = parseMonthKey(monthKey)
  return type === '연도별' ? `${year}년` : `${year}년 ${month}월`
}

export const formatPreviousPeriod = (period: Period) => {
  const [year, month] = parseMonthKey(shiftPeriod(period, -1).monthKey)
  return period.type === '연도별' ? `${year}년` : `${month}월`
}

export const isLatestPeriod = (period: Period, currentMonthKey: string) => {
  if (period.type === '월별') return period.monthKey >= currentMonthKey
  return period.monthKey.slice(0, 4) >= currentMonthKey.slice(0, 4)
}

export const isEarliestPeriod = (period: Period) => {
  if (period.type === '월별') return period.monthKey <= EARLIEST_MONTH_KEY
  return period.monthKey.slice(0, 4) <= EARLIEST_MONTH_KEY.slice(0, 4)
}

export const monthKeysOfYear = (monthKey: string) => {
  const year = monthKey.slice(0, 4)
  return Array.from({ length: 12 }, (_, index) => `${year}-${pad(index + 1)}`)
}

// 진행 중인 해를 작년 한 해 전체와 비교하면 늘 적어 보이므로, 작년 같은 날까지만 잘라서 비교한다.
// 진행 중인 달은 며칠 치뿐이라 비교하지 않는다.
export const previousComparison = (period: Period, today: Date): { range: PeriodRange; label: string } | null => {
  const todayMonthKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`
  if (period.type === '월별' && period.monthKey === todayMonthKey) return null

  const isCurrentYear = period.type === '연도별' && Number(period.monthKey.slice(0, 4)) === today.getFullYear()
  if (!isCurrentYear) return { range: toRange(shiftPeriod(period, -1)), label: formatPreviousPeriod(period) }

  const lastYear = today.getFullYear() - 1
  return {
    range: {
      start: new Date(lastYear, 0, 1).toISOString(),
      end: new Date(lastYear, today.getMonth(), today.getDate() + 1).toISOString(),
    },
    label: '작년 같은 기간',
  }
}
