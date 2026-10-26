import { toDateKey } from '../utils/format'
import type { Person } from './types'

export type CalendarTarget = '공동' | Person | '없음'
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RepeatScope = 'one' | 'following' | 'all'

// 종일 일정의 start/end는 'YYYY-MM-DD'이고 end는 마지막 날(포함)이다. 시간 일정은 ISO 문자열.
export type CalendarEvent = {
  id: string
  seriesId: string | null
  originalStart: string | null
  title: string
  allDay: boolean
  start: string
  end: string
  target: CalendarTarget
  repeat: Repeat
}

// start는 회차의 지금 시작 시각. 따로 옮겨 둔 회차를 '전체'로 고칠 때 기준이 된다.
export type CalendarEventRef = Pick<CalendarEvent, 'id' | 'seriesId' | 'originalStart'> & { start?: string }

// rrule·recurrence는 TimeTree 가져오기 전용: 있으면 repeat 대신 원문 규칙(RRULE/EXDATE/RDATE 줄)을 쓴다.
export type CalendarEventInput = Omit<CalendarEvent, 'id' | 'seriesId' | 'originalStart'> & {
  ref?: CalendarEventRef
  rrule?: string
  recurrence?: string[]
}

export const CALENDAR_TARGETS: CalendarTarget[] = ['공동', '쿠리만쥬', '우사기', '없음']
export const REPEATS: Repeat[] = ['none', 'daily', 'weekly', 'monthly', 'yearly']

// TimeTree에서 쓰던 색을 이어서, 공동은 검정·쿠리만쥬는 초록·우사기는 노랑 계열로 칠한다.
export const TARGET_TONE: Record<CalendarTarget, string> = {
  공동: 'target-shared',
  쿠리만쥬: 'target-kurimanju',
  우사기: 'target-usagi',
  없음: 'target-none',
}

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: '안 함',
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
  yearly: '매년',
}

const MIN_WEEKS = 5

const pad = (value: number) => String(value).padStart(2, '0')

const toKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const fromKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const addDays = (dateKey: string, days: number) => {
  const date = fromKey(dateKey)
  date.setDate(date.getDate() + days)
  return toKey(date)
}

export const monthGrid = (monthKey: string): string[][] => {
  const [year, month] = monthKey.split('-').map(Number)
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const weeks = Math.max(MIN_WEEKS, Math.ceil((first.getDay() + daysInMonth) / 7))
  const gridStart = addDays(toKey(first), -first.getDay())
  return Array.from({ length: weeks }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(gridStart, week * 7 + day)))
}

export const gridRange = (monthKey: string) => {
  const grid = monthGrid(monthKey)
  return { start: grid[0][0], end: grid.at(-1)![6] }
}

const startDayOf = (event: CalendarEvent) => (event.allDay ? event.start : toDateKey(event.start))

// 0시 정각에 끝나는 시간 일정은 그날까지만 걸친 것으로 본다.
const lastDayOf = (event: CalendarEvent) => {
  if (event.allDay) return event.end
  const end = new Date(event.end)
  const isMidnight = end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0
  const lastDay = toDateKey(event.end)
  return isMidnight && lastDay > startDayOf(event) ? addDays(lastDay, -1) : lastDay
}

const sortRank = (event: CalendarEvent) => {
  if (event.target === '없음') return 0
  if (event.allDay) return 1
  return 2
}

export const eventsOnDay = (events: CalendarEvent[], dateKey: string) =>
  events
    .filter(event => startDayOf(event) <= dateKey && dateKey <= lastDayOf(event))
    .sort(
      (left, right) =>
        sortRank(left) - sortRank(right) ||
        Number(right.allDay) - Number(left.allDay) ||
        new Date(left.start).getTime() - new Date(right.start).getTime(),
    )

const weekendOf = (dateKey: string) => {
  const weekday = fromKey(dateKey).getDay()
  if (weekday === 0) return 'sun' as const
  if (weekday === 6) return 'sat' as const
  return null
}

export const dayTone = (dateKey: string, monthKey: string) => ({
  weekday: weekendOf(dateKey),
  isOutside: !dateKey.startsWith(monthKey),
  isToday: dateKey === toKey(new Date()),
})

export type CalendarBar = {
  event: CalendarEvent
  startColumn: number
  span: number
  lane: number
  continuesBefore: boolean
  continuesAfter: boolean
}

// 한 주(일~토)의 일정을 막대로 배치한다. 칸 높이에 줄이 모자라면 마지막 줄은 '+N' 자리로 남긴다.
export const weekLayout = (week: string[], events: CalendarEvent[], maxLanes: number) => {
  const first = week[0]
  const last = week[6]
  const segments = events
    .filter(event => startDayOf(event) <= last && lastDayOf(event) >= first)
    .map(event => {
      const from = startDayOf(event) < first ? first : startDayOf(event)
      const to = lastDayOf(event) > last ? last : lastDayOf(event)
      const startColumn = week.indexOf(from)
      return {
        event,
        startColumn,
        span: week.indexOf(to) - startColumn + 1,
        continuesBefore: startDayOf(event) < first,
        continuesAfter: lastDayOf(event) > last,
      }
    })
    .sort(
      (left, right) =>
        left.startColumn - right.startColumn ||
        right.span - left.span ||
        sortRank(left.event) - sortRank(right.event) ||
        new Date(left.event.start).getTime() - new Date(right.event.start).getTime(),
    )

  const occupied: boolean[][] = []
  const placed = segments.map(segment => {
    const columns = Array.from({ length: segment.span }, (_, offset) => segment.startColumn + offset)
    let lane = 0
    while (columns.some(column => occupied[lane]?.[column])) lane += 1
    occupied[lane] ??= []
    columns.forEach(column => (occupied[lane][column] = true))
    return { ...segment, lane }
  })

  const isOverflow = occupied.length > maxLanes
  const visibleLanes = isOverflow ? Math.max(0, maxLanes - 1) : maxLanes
  const hidden = week.map((_, column) =>
    placed.filter(bar => bar.lane >= visibleLanes && column >= bar.startColumn && column < bar.startColumn + bar.span).length,
  )
  return {
    bars: placed.filter(bar => bar.lane < visibleLanes),
    hidden,
    moreLane: isOverflow ? visibleLanes : null,
  }
}
