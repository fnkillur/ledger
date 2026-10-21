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
