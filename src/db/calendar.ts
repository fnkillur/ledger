import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import {
  calendarWindow,
  gridRange,
  overlapsRange,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarEventRef,
  type RepeatScope,
} from '../domain/calendar'
import { displayName } from '../domain/nickname'
import { DEVICE_PERSON } from '../platform'
import { ServerResponseError } from '../sync/api'
import { deleteCalendarEvent, fetchCalendar, saveCalendarEvent, type CalendarActor } from '../sync/calendarApi'
import { getSettings, isSyncConfigured } from '../sync/settings'
import { currentMonthKey } from '../utils/format'
import { db, type CalendarOp } from './database'

const LOCAL_ID_PREFIX = 'local-'

const isRetryable = (error: unknown) => error instanceof TypeError || error instanceof ServerResponseError

export const toCalendarError = (error: unknown) => {
  if (error instanceof TypeError) return '인터넷 연결을 확인해 주세요.'
  if (error instanceof ServerResponseError) return `시트 서버가 잠시 응답하지 못했어요. (${error.status})`
  return error instanceof Error ? error.message : '알 수 없는 오류가 났어요.'
}

const isLocalId = (id: string) => id.startsWith(LOCAL_ID_PREFIX)

const ensureConfigured = () => {
  if (!isSyncConfigured(getSettings())) throw new Error('구글 시트와 아직 연결되지 않았어요. 설정에서 연결 코드를 붙여넣어 주세요.')
}

// 대기열에 걸린 일정은 서버에서 다시 받아도 덮어쓰지 않도록 id를 모은다.
const pendingIds = (ops: CalendarOp[]) =>
  new Set(
    ops
      .flatMap(op => (op.type === 'delete' ? [op.ref.id, op.ref.seriesId] : [op.localId, op.input.ref?.id, op.input.ref?.seriesId]))
      .filter((id): id is string => !!id),
  )

const isPending = (event: CalendarEvent, pending: Set<string>) => pending.has(event.id) || pending.has(event.seriesId ?? '')

const replaceRange = async (start: string, end: string, events: CalendarEvent[]) => {
  await db.transaction('rw', [db.calendarEvents, db.calendarOutbox], async () => {
    const pending = pendingIds(await db.calendarOutbox.toArray())
    const stale = (await db.calendarEvents.toArray()).filter(event => overlapsRange(event, start, end) && !isPending(event, pending))
    await db.calendarEvents.bulkDelete(stale.map(event => event.id))
    await db.calendarEvents.bulkPut(events.filter(event => !isPending(event, pending)))
  })
}

const currentActor = async (): Promise<CalendarActor> => ({
  person: DEVICE_PERSON,
  name: displayName(DEVICE_PERSON, (await db.shared.get('shared'))?.닉네임 ?? {}),
})

const sendOp = async (op: CalendarOp) => {
  if (op.type === 'save') return saveCalendarEvent(getSettings(), op.input, op.scope, await currentActor())
  return deleteCalendarEvent(getSettings(), op.ref, op.scope)
}

const pushOutbox = async () => {
  for (;;) {
    const op = await db.calendarOutbox.orderBy('seq').first()
    if (!op) return
    try {
      await sendOp(op)
    } catch (error) {
      // 인터넷이 끊겼거나 서버가 잠시 응답하지 못한 건 남겨 두고 다음에 다시 보내고, 서버가 거절한 작업만 버리고 알린다.
      if (!isRetryable(error)) await db.calendarOutbox.delete(op.seq!)
      throw error
    }
    await db.calendarOutbox.delete(op.seq!)
  }
}

const recordError = async (error: unknown) => {
  const meta = await db.calendarMeta.get('window')
  await db.calendarMeta.put({ key: 'window', start: meta?.start ?? '', end: meta?.end ?? '', fetchedAt: meta?.fetchedAt ?? '', error: toCalendarError(error) })
}

// 오류 안내의 닫기 버튼. 다음 동기화가 실패하면 다시 보인다.
export const dismissCalendarError = async () => {
  const meta = await db.calendarMeta.get('window')
  if (meta?.error) await db.calendarMeta.put({ ...meta, error: undefined })
}

const MAX_SYNC_ROUNDS = 3

let running: Promise<void> | null = null

// 대기열을 먼저 보내고, 다 보냈을 때만 받아 둔 범위를 서버 기준으로 새로 맞춘다.
export const syncCalendar = () => {
  running ??= (async () => {
    try {
      if (!isSyncConfigured(getSettings())) return
      // 받는 동안 새 작업이 쌓였으면 그것까지 보낸 뒤 다시 받는다.
      for (let round = 0; round < MAX_SYNC_ROUNDS; round += 1) {
        await pushOutbox()
        const { start, end } = calendarWindow(currentMonthKey())
        const events = await fetchCalendar(getSettings(), start, end)
        if ((await db.calendarOutbox.count()) > 0) continue
        await replaceRange(start, end, events)
        await db.calendarMeta.put({ key: 'window', start, end, fetchedAt: new Date().toISOString() })
        return
      }
    } catch (error) {
      await recordError(error)
    } finally {
      running = null
    }
  })()
  return running
}

// 받아 둔 범위 밖의 달로 가면 그 달만 받아 둔다.
export const ensureMonth = async (monthKey: string) => {
  const meta = await db.calendarMeta.get('window')
  const range = gridRange(monthKey)
  if (meta?.start && range.start >= meta.start && range.end <= meta.end) return
  if (!isSyncConfigured(getSettings())) return
  const events = await fetchCalendar(getSettings(), range.start, range.end)
  await replaceRange(range.start, range.end, events)
}

const seriesTargets = async (ref: CalendarEventRef, scope: RepeatScope) => {
  const series = await db.calendarEvents.where('seriesId').equals(ref.seriesId!).toArray()
  if (scope !== 'following') return series
  return series.filter(event => (event.originalStart ?? event.start) >= (ref.originalStart ?? ''))
}

const applyLocalSave = async (input: CalendarEventInput, scope: RepeatScope | undefined, localId: string | undefined) => {
  const fields = { title: input.title, target: input.target, allDay: input.allDay, start: input.start, end: input.end }
  const ref = input.ref
  if (!ref) {
    await db.calendarEvents.put({ id: localId!, seriesId: null, originalStart: null, repeat: input.repeat, ...fields })
    return
  }
  if (!ref.seriesId) {
    await db.calendarEvents.update(ref.id, { ...fields, repeat: input.repeat })
    return
  }
  if (scope === 'one') {
    await db.calendarEvents.update(ref.id, fields)
    return
  }
  // 반복 전체·이후 모두는 회차 날짜 계산을 서버에 맡기고, 제목과 대상만 먼저 바꿔 둔다.
  const targets = await seriesTargets(ref, scope ?? 'all')
  await db.calendarEvents.bulkPut(targets.map(event => ({ ...event, title: input.title, target: input.target })))
}

const applyLocalDelete = async (ref: CalendarEventRef, scope: RepeatScope) => {
  if (!ref.seriesId || scope === 'one') {
    await db.calendarEvents.delete(ref.id)
    return
  }
  const targets = await seriesTargets(ref, scope)
  await db.calendarEvents.bulkDelete(targets.map(event => event.id))
}

const findQueuedCreate = async (localId: string) =>
  (await db.calendarOutbox.toArray()).find((op): op is Extract<CalendarOp, { type: 'save' }> => op.type === 'save' && op.localId === localId)

export const saveEvent = async (input: CalendarEventInput, scope?: RepeatScope) => {
  ensureConfigured()
  await db.transaction('rw', [db.calendarEvents, db.calendarOutbox], async () => {
    // 아직 보내지 않은 새 일정을 고치면, 대기 중인 '추가' 작업 내용만 바꾼다.
    const queued = input.ref && isLocalId(input.ref.id) ? await findQueuedCreate(input.ref.id) : undefined
    if (queued) {
      const created = { ...input, ref: undefined }
      await db.calendarOutbox.put({ ...queued, input: created } as CalendarOp)
      await applyLocalSave(created, undefined, queued.localId)
      return
    }
    const localId = input.ref ? undefined : `${LOCAL_ID_PREFIX}${crypto.randomUUID()}`
    await db.calendarOutbox.add({ type: 'save', input, scope, localId } as CalendarOp)
    await applyLocalSave(input, scope, localId)
  })
  syncCalendar()
}

export const deleteEvent = async (ref: CalendarEventRef, scope: RepeatScope) => {
  ensureConfigured()
  await db.transaction('rw', [db.calendarEvents, db.calendarOutbox], async () => {
    const queued = isLocalId(ref.id) ? await findQueuedCreate(ref.id) : undefined
    if (queued) {
      await db.calendarOutbox.delete(queued.seq!)
      await db.calendarEvents.delete(ref.id)
      return
    }
    await db.calendarOutbox.add({ type: 'delete', ref, scope } as CalendarOp)
    await applyLocalDelete(ref, scope)
  })
  syncCalendar()
}

export function useCalendarEvents() {
  return useLiveQuery(() => db.calendarEvents.toArray(), [])
}

export function useCalendarStatus() {
  const meta = useLiveQuery(() => db.calendarMeta.get('window'), [])
  const pendingCount = useLiveQuery(() => db.calendarOutbox.count(), []) ?? 0
  return { error: meta?.error ?? null, pendingCount }
}

// 화면을 열 때·앱으로 돌아올 때·인터넷이 다시 연결될 때 동기화하고, 범위 밖 달은 따로 받는다.
export function useCalendarSync(monthKey: string) {
  useEffect(() => {
    syncCalendar()
    const handleVisible = () => {
      if (document.visibilityState === 'visible') syncCalendar()
    }
    document.addEventListener('visibilitychange', handleVisible)
    window.addEventListener('online', syncCalendar)
    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      window.removeEventListener('online', syncCalendar)
    }
  }, [])

  useEffect(() => {
    ensureMonth(monthKey).catch(() => {})
  }, [monthKey])
}
