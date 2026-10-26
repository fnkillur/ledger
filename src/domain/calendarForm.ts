import { formatTime, toDateKey } from '../utils/format'
import { addDays, type CalendarEvent, type CalendarEventInput, type CalendarTarget, type Repeat } from './calendar'

export type CalendarForm = {
  title: string
  target: CalendarTarget
  allDay: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  repeat: Repeat
}

const DEFAULT_MINUTES = 60

const toLocalDate = (date: string, time: string) => new Date(`${date}T${time}`)

const splitDate = (date: Date) => ({ date: toDateKey(date.toISOString()), time: formatTime(date.toISOString()) })

const durationMinutes = (form: CalendarForm) =>
  Math.round((toLocalDate(form.endDate, form.endTime).getTime() - toLocalDate(form.startDate, form.startTime).getTime()) / 60000)

// 새 일정은 지금 시각의 다음 정시에 시작하되, 날짜는 고른 날로 둔다. 밤 11시 이후엔 23시로 둔다.
export const newForm = (dateKey: string, target: CalendarTarget, now: Date): CalendarForm => {
  const startHour = Math.min(now.getHours() + 1, 23)
  const startTime = `${String(startHour).padStart(2, '0')}:00`
  const end = splitDate(new Date(toLocalDate(dateKey, startTime).getTime() + DEFAULT_MINUTES * 60000))
  return { title: '', target, allDay: false, startDate: dateKey, startTime, endDate: end.date, endTime: end.time, repeat: 'none' }
}

export const formFromEvent = (event: CalendarEvent): CalendarForm => {
  if (event.allDay) {
    return { title: event.title, target: event.target, allDay: true, startDate: event.start, startTime: '09:00', endDate: event.end, endTime: '10:00', repeat: event.repeat }
  }
  const start = new Date(event.start)
  const end = new Date(event.end)
  return {
    title: event.title,
    target: event.target,
    allDay: false,
    startDate: splitDate(start).date,
    startTime: splitDate(start).time,
    endDate: splitDate(end).date,
    endTime: splitDate(end).time,
    repeat: event.repeat,
  }
}

export const moveStart = (form: CalendarForm, patch: Partial<Pick<CalendarForm, 'startDate' | 'startTime'>>): CalendarForm => {
  const next = { ...form, ...patch }
  if (form.allDay) {
    const lengthDays = Math.round((toLocalDate(form.endDate, '00:00').getTime() - toLocalDate(form.startDate, '00:00').getTime()) / 86400000)
    return { ...next, endDate: addDays(next.startDate, Math.max(0, lengthDays)) }
  }
  const end = splitDate(new Date(toLocalDate(next.startDate, next.startTime).getTime() + Math.max(0, durationMinutes(form)) * 60000))
  return { ...next, endDate: end.date, endTime: end.time }
}

export const canSaveForm = (form: CalendarForm) => {
  if (form.title.trim() === '') return false
  if (form.allDay) return form.endDate >= form.startDate
  return durationMinutes(form) > 0
}

export const toEventInput = (form: CalendarForm): CalendarEventInput => ({
  title: form.title.trim(),
  target: form.target,
  allDay: form.allDay,
  start: form.allDay ? form.startDate : toLocalDate(form.startDate, form.startTime).toISOString(),
  end: form.allDay ? form.endDate : toLocalDate(form.endDate, form.endTime).toISOString(),
  repeat: form.repeat,
})
