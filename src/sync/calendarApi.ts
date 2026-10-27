import type { CalendarEvent, CalendarEventInput, CalendarEventRef, RepeatScope } from '../domain/calendar'
import type { Person } from '../domain/types'
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

// 서버가 새 일정을 상대방에게 알릴 때 "누가 추가했는지"를 쓴다.
export type CalendarActor = { person: Person; name: string }

export const saveCalendarEvent = async (settings: Settings, input: CalendarEventInput, scope: RepeatScope | undefined, actor: CalendarActor) =>
  (await unwrap<{ id: string }>(await post(settings, { action: 'calendarSave', event: input, scope, actor }))).id

export const deleteCalendarEvent = async (settings: Settings, ref: CalendarEventRef, scope: RepeatScope) => {
  await unwrap(await post(settings, { action: 'calendarDelete', ref, scope }))
}

export const registerPushToken = async (settings: Settings, body: { pushToken: string; person: Person; platform: 'android' | 'web' }) => {
  await unwrap(await post(settings, { action: 'pushRegister', ...body }))
}

export const unregisterPushToken = async (settings: Settings, pushToken: string) => {
  await unwrap(await post(settings, { action: 'pushUnregister', pushToken }))
}
