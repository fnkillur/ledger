import type { CalendarChange, CalendarEvent, CalendarEventInput, CalendarEventRef, Holiday, RepeatScope } from '../domain/calendar'
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
  // 공휴일을 보내기 전의 서버는 holidays가 없다.
  return request<{ events: CalendarEvent[]; holidays?: Holiday[] }>(url)
}

// 확인 번호 없이 부르면 새 번호만 준다. 구글이 번호를 버렸으면 reset과 함께 새 번호를 준다.
export const fetchCalendarChanges = async (settings: Settings, syncToken: string | undefined) => {
  const url = new URL(settings.endpoint)
  url.searchParams.set('action', 'calendarChanges')
  url.searchParams.set('token', settings.token)
  if (syncToken) url.searchParams.set('syncToken', syncToken)
  return request<{ syncToken: string; reset?: boolean; changes?: CalendarChange[] }>(url)
}

// 서버가 상대방에게 알릴 때 "누가 바꿨는지"를 쓴다.
export type CalendarActor = { person: Person; name: string }

export const saveCalendarEvent = async (
  settings: Settings,
  input: CalendarEventInput,
  scope: RepeatScope | undefined,
  actor: CalendarActor,
  createId: string | undefined,
) => (await post<{ id: string }>(settings, { action: 'calendarSave', event: input, scope, actor, createId })).id

export const deleteCalendarEvent = async (settings: Settings, ref: CalendarEventRef, scope: RepeatScope, actor: CalendarActor) => {
  await post(settings, { action: 'calendarDelete', ref, scope, actor })
}

export const registerPushToken = async (settings: Settings, body: { pushToken: string; person: Person; platform: 'android' | 'web' }) => {
  await post(settings, { action: 'pushRegister', ...body })
}

export const unregisterPushToken = async (settings: Settings, pushToken: string) => {
  await post(settings, { action: 'pushUnregister', pushToken })
}
