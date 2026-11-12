import type { CalendarEvent, CalendarEventInput, CalendarEventRef, RepeatScope } from '../domain/calendar'
import type { Person } from '../domain/types'
import { unwrap } from './api'
import type { Settings } from './settings'

const REQUEST_TIMEOUT_MS = 20_000

export class RequestTimeoutError extends Error {}

// 앱이 뒤로 갔다 오며 끊긴 연결은 응답도 실패도 없이 멈춰 있을 수 있어서, 제한 시간이 지나면 그만두고 실패로 끝낸다.
const request = async <T>(input: URL | string, init: RequestInit = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await unwrap<T>(await fetch(input, { ...init, signal: controller.signal }))
  } catch (error) {
    if (controller.signal.aborted) throw new RequestTimeoutError()
    throw error
  } finally {
    clearTimeout(timer)
  }
}

const post = <T>(settings: Settings, body: Record<string, unknown>) =>
  request<T>(settings.endpoint, {
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
  return (await request<{ events: CalendarEvent[] }>(url)).events
}

// 서버가 새 일정을 상대방에게 알릴 때 "누가 추가했는지"를 쓴다.
export type CalendarActor = { person: Person; name: string }

export const saveCalendarEvent = async (
  settings: Settings,
  input: CalendarEventInput,
  scope: RepeatScope | undefined,
  actor: CalendarActor,
  createId: string | undefined,
) => (await post<{ id: string }>(settings, { action: 'calendarSave', event: input, scope, actor, createId })).id

export const deleteCalendarEvent = async (settings: Settings, ref: CalendarEventRef, scope: RepeatScope) => {
  await post(settings, { action: 'calendarDelete', ref, scope })
}

export const registerPushToken = async (settings: Settings, body: { pushToken: string; person: Person; platform: 'android' | 'web' }) => {
  await post(settings, { action: 'pushRegister', ...body })
}

export const unregisterPushToken = async (settings: Settings, pushToken: string) => {
  await post(settings, { action: 'pushUnregister', pushToken })
}
