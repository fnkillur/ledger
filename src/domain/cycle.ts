import { isAggregate, type Person, type Transaction } from './types'

export type CycleUnit = 'day' | 'week' | 'month' | 'year'
export type CyclePeriod = { amount: number; unit: CycleUnit }
export type CycleTarget = '공동' | Person
export type CycleLink = { category: string; keyword: string; person: Person | '' }
// offsets: 다음 날 며칠 전에 알릴지(주기 있는 항목). afterDays: 마지막 날부터 며칠 지나면 알릴지(주기 없는 항목).
export type CycleNotify = { enabled: boolean; offsets: number[]; afterDays: number | null }

export type CycleItem = {
  id: string
  name: string
  icon: string
  target: CycleTarget
  period: CyclePeriod | null
  link: CycleLink | null
  notify: CycleNotify
  memo: string
  deleted: boolean
  updatedAt: string
}

export type CycleInput = Omit<CycleItem, 'id' | 'deleted' | 'updatedAt'>

export type CycleLog = { id: string; cycleId: string; date: string; person: Person; deleted: boolean; updatedAt: string }

// days: 주기 있는 항목은 다음 날까지 남은 날(지나면 음수), 주기 없는 항목은 마지막 날부터 지난 날.
export type CycleState = {
  lastDate: string | null
  lastSource: 'log' | 'payment' | null
  lastMerchant: string
  nextDate: string | null
  days: number | null
}

export const NOTIFY_OFFSETS = [0, 1, 3, 7]

const DAY_MS = 24 * 60 * 60 * 1000
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000

const pad = (value: number) => String(value).padStart(2, '0')

const toUtcDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

const toKey = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`

// 결제 시각은 기기 시간대와 상관없이 한국 날짜로 본다.
const toSeoulDateKey = (iso: string) => new Date(Date.parse(iso) + SEOUL_OFFSET_MS).toISOString().slice(0, 10)

export const daysBetween = (from: string, to: string) => Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / DAY_MS)

const normalize = (text: string) => text.replace(/\s+/g, '').toLowerCase()

export const addPeriod = (dateKey: string, period: CyclePeriod) => {
  const date = toUtcDate(dateKey)
  if (period.unit === 'day' || period.unit === 'week') {
    date.setUTCDate(date.getUTCDate() + period.amount * (period.unit === 'week' ? 7 : 1))
    return toKey(date)
  }
  const months = period.amount * (period.unit === 'year' ? 12 : 1)
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay))
  return toKey(target)
}

export const isLinkValid = (link: CycleLink | null) => !!link && (link.category.trim() !== '' || link.keyword.trim() !== '')

const matchesLink = (link: CycleLink, transaction: Transaction) => {
  if (transaction.deleted || transaction.kind !== '지출' || isAggregate(transaction.source)) return false
  if (link.person && transaction.person !== link.person) return false
  if (link.category.trim() && transaction.category !== link.category.trim()) return false
  if (link.keyword.trim() && !normalize(transaction.merchant).includes(normalize(link.keyword))) return false
  return true
}

export const lastPayment = (link: CycleLink, transactions: Transaction[]) => {
  if (!isLinkValid(link)) return null
  return transactions.reduce<{ date: string; merchant: string } | null>((latest, transaction) => {
    if (!matchesLink(link, transaction)) return latest
    const date = toSeoulDateKey(transaction.occurredAt)
    return !latest || date > latest.date ? { date, merchant: transaction.merchant } : latest
  }, null)
}

export const cycleState = (item: CycleItem, logs: CycleLog[], transactions: Transaction[], today: string): CycleState => {
  const lastLog = logs
    .filter(log => !log.deleted && log.cycleId === item.id)
    .reduce<string | null>((latest, log) => (!latest || log.date > latest ? log.date : latest), null)
  const payment = item.link ? lastPayment(item.link, transactions) : null
  const isPaymentLatest = !!payment && (!lastLog || payment.date > lastLog)
  const lastDate = isPaymentLatest ? payment.date : lastLog

  if (!lastDate) return { lastDate: null, lastSource: null, lastMerchant: '', nextDate: null, days: null }
  const nextDate = item.period ? addPeriod(lastDate, item.period) : null
  return {
    lastDate,
    lastSource: isPaymentLatest ? 'payment' : 'log',
    lastMerchant: isPaymentLatest ? payment.merchant : '',
    nextDate,
    days: nextDate ? daysBetween(today, nextDate) : daysBetween(lastDate, today),
  }
}

export const dueOffsetToday = (item: CycleItem, state: CycleState) => {
  if (!item.notify.enabled || state.days === null) return null
  if (item.period) return state.days >= 0 && item.notify.offsets.includes(state.days) ? state.days : null
  return item.notify.afterDays !== null && state.days === item.notify.afterDays ? state.days : null
}

const sortGroup = (row: { item: CycleItem; state: CycleState }) => {
  if (row.item.period && row.state.days !== null) return 0
  if (row.state.days === null) return 1
  return 2
}

export const sortCycles = <Row extends { item: CycleItem; state: CycleState }>(rows: Row[]) =>
  [...rows].sort((left, right) => {
    const group = sortGroup(left) - sortGroup(right)
    if (group !== 0) return group
    if (sortGroup(left) === 0) return left.state.days! - right.state.days!
    if (sortGroup(left) === 2) return right.state.days! - left.state.days!
    return 0
  })

// 캘린더에는 주기 있는 항목의 다음 날짜만 표시한다.
export const cycleDueByDate = (rows: { item: CycleItem; state: CycleState }[]) =>
  rows.reduce((byDate, row) => {
    if (!row.item.period || !row.state.nextDate) return byDate
    byDate.set(row.state.nextDate, [...(byDate.get(row.state.nextDate) ?? []), row.item])
    return byDate
  }, new Map<string, CycleItem[]>())
