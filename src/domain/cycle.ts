import type { CalendarTarget } from './calendar'
import type { Person } from './types'

export type CycleUnit = 'day' | 'week' | 'month' | 'year'
export type CyclePeriod = { amount: number; unit: CycleUnit }
export type CycleTarget = '공동' | Person

export type CycleItem = {
  id: string
  name: string
  icon: string
  target: CycleTarget
  // 캘린더 일정 제목에 들어간 말. 비면 이름으로 찾는다.
  keyword: string
  // 주기 있는 항목의 첫 회차(처음 한 날). 회차는 여기서 주기만큼씩 달력에 고정된다. 비면 마지막 일정을 쓴다.
  anchor: string | null
  period: CyclePeriod | null
  memo: string
  deleted: boolean
  updatedAt: string
}

export type CycleInput = Omit<CycleItem, 'id' | 'deleted' | 'updatedAt'>

export type CycleEvent = { title: string; start: string; target: CalendarTarget }

// reservation: 오늘 뒤로 가장 가까운 맞는 일정. days: 주기 있는 항목은 다음 날까지 남은 날(지나면 음수), 주기 없는 항목은 마지막 날부터 지난 날.
export type CycleState = {
  lastDate: string | null
  reservation: string | null
  nextDate: string | null
  isReservedNext: boolean
  days: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000

const pad = (value: number) => String(value).padStart(2, '0')

const toUtcDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

const toKey = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`

// 종일 일정은 날짜 그대로, 시간 일정은 기기 시간대와 상관없이 한국 날짜로 본다.
const eventDateKey = (start: string) => (start.length === 10 ? start : new Date(Date.parse(start) + SEOUL_OFFSET_MS).toISOString().slice(0, 10))

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

const searchWord = (item: CycleItem) => normalize(item.keyword.trim() || item.name)

// 기념일은 보지 않고, 지정일은 누구 것이든 맞는다. 사람 항목은 그 사람과 공동 일정, 공동 항목은 모든 사람 일정을 본다.
const isTargetMatched = (item: CycleItem, target: CalendarTarget) => {
  if (target === '기념일') return false
  if (target === '없음' || item.target === '공동') return true
  return target === item.target || target === '공동'
}

export const matchesCycleEvent = (item: CycleItem, event: CycleEvent) =>
  isTargetMatched(item, event.target) && searchWord(item) !== '' && normalize(event.title).includes(searchWord(item))

// 회차보다 이만큼 일찍 해도 그 회차를 한 것으로 본다(짧은 주기는 주기의 절반까지).
const EARLY_DAYS = 7

const dueAt = (anchor: string, period: CyclePeriod, index: number) => addPeriod(anchor, { amount: period.amount * index, unit: period.unit })

// 한 날들이 채운 마지막 회차 번호. 한 번 할 때마다 아직 안 한 가장 오래된 회차를 채우고,
// 그날(조금 일찍 한 것까지) 이미 지나간 회차가 더 있으면 함께 정리한다.
const coveredIndex = (anchor: string, period: CyclePeriod, doneDates: string[]) => {
  const earlyDays = Math.min(EARLY_DAYS, Math.floor(daysBetween(anchor, dueAt(anchor, period, 1)) / 2))
  return [...new Set(doneDates)]
    .filter(date => date > anchor)
    .sort()
    .reduce((covered, date) => {
      const reach = addPeriod(date, { amount: earlyDays, unit: 'day' })
      let passed = covered
      while (dueAt(anchor, period, passed + 1) <= reach) passed += 1
      return Math.max(covered + 1, passed)
    }, 0)
}

export const cycleState = (item: CycleItem, events: CycleEvent[], today: string): CycleState => {
  const dates = events.filter(event => matchesCycleEvent(item, event)).map(event => eventDateKey(event.start))
  const doneDates = dates.filter(date => date <= today)
  const doneDate = doneDates.reduce<string | null>((latest, date) => (!latest || date > latest ? date : latest), null)
  const reservation = dates.filter(date => date > today).reduce<string | null>((earliest, date) => (!earliest || date < earliest ? date : earliest), null)

  if (!item.period) return { lastDate: doneDate, reservation, nextDate: null, isReservedNext: false, days: doneDate ? daysBetween(doneDate, today) : null }

  const anchor = item.anchor ?? doneDate
  if (!anchor) return { lastDate: null, reservation, nextDate: reservation, isReservedNext: reservation !== null, days: reservation ? daysBetween(today, reservation) : null }

  const isDoneCounted = !!doneDate && doneDate >= anchor
  const nextDate = dueAt(anchor, item.period, coveredIndex(anchor, item.period, doneDates) + 1)
  return { lastDate: isDoneCounted ? doneDate : anchor, reservation, nextDate, isReservedNext: false, days: daysBetween(today, nextDate) }
}

const byDaysNullLast = (compare: (left: number, right: number) => number) => (left: { state: CycleState }, right: { state: CycleState }) => {
  if (left.state.days === null || right.state.days === null) return Number(left.state.days === null) - Number(right.state.days === null)
  return compare(left.state.days, right.state.days)
}

// 개인 항목은 기본으로 내 것만 보이고, 공동은 늘 보인다.
export const visibleCycles = <Row extends { item: CycleItem }>(rows: Row[], me: Person, showsOthers: boolean) =>
  rows.filter(row => showsOthers || row.item.target === '공동' || row.item.target === me)

// 교체 주기는 기한이 가까운 순, 마지막으로 한 지는 오래된 순. 기록이 없으면 뒤로 보낸다.
export const splitCycles = <Row extends { item: CycleItem; state: CycleState }>(rows: Row[]) => ({
  periodic: rows.filter(row => row.item.period).sort(byDaysNullLast((left, right) => left - right)),
  elapsed: rows.filter(row => !row.item.period).sort(byDaysNullLast((left, right) => right - left)),
})

// 일정 폼에서 이 일정이 어느 주기 항목에 기록되는지 알려 줄 때 쓴다.
export const findCycleForEvent = (items: CycleItem[], event: CycleEvent) => items.find(item => !item.deleted && matchesCycleEvent(item, event)) ?? null

// 일정을 넣다가 바로 챙길 항목을 만든다. 지정일 일정은 사람이 없어 공동으로 둔다.
export const cycleFromEvent = (title: string, target: CalendarTarget): CycleInput => ({
  name: title.trim(),
  icon: '',
  target: target === '공동' || target === '쿠리만쥬' || target === '우사기' ? target : '공동',
  keyword: title.trim(),
  anchor: null,
  period: null,
  memo: '',
})

// 캘린더에는 주기 있는 항목의 다음 날짜만 표시한다.
export const cycleDueByDate = (rows: { item: CycleItem; state: CycleState }[]) =>
  rows.reduce((byDate, row) => {
    if (!row.item.period || !row.state.nextDate) return byDate
    byDate.set(row.state.nextDate, [...(byDate.get(row.state.nextDate) ?? []), row.item])
    return byDate
  }, new Map<string, CycleItem[]>())
