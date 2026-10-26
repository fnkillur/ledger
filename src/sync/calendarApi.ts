import type { CalendarEvent, CalendarEventInput, CalendarEventRef, RepeatScope } from '../domain/calendar'
import { unwrap } from './api'
import type { Settings } from './settings'

const post = (settings: Settings, body: Record<string, unknown>) =>
  fetch(settings.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: settings.token, ...body }),
  })

export const fetchCalendar = async (settings: Settings, start: string, end: string) => {
  const url = new URL(settings.endpoint)
  url.searchParams.set('action', 'calendar')
  url.searchParams.set('token', settings.token)
  url.searchParams.set('start', start)
  url.searchParams.set('end', end)
  return (await unwrap<{ events: CalendarEvent[] }>(await fetch(url))).events
}

export const saveCalendarEvent = async (settings: Settings, input: CalendarEventInput, scope?: RepeatScope) =>
  (await unwrap<{ id: string }>(await post(settings, { action: 'calendarSave', event: input, scope }))).id

export const deleteCalendarEvent = async (settings: Settings, ref: CalendarEventRef, scope: RepeatScope) => {
  await unwrap(await post(settings, { action: 'calendarDelete', ref, scope }))
}
