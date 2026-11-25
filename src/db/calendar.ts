import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import {
  changedMonths,
  gridRange,
  monthRuns,
  monthsAround,
  overlapsRange,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarEventRef,
  type Holiday,
  type RepeatScope,
} from '../domain/calendar'
import { longestPeriodMonths } from '../domain/cycle'
import { displayName } from '../domain/nickname'
import { DEVICE_PERSON } from '../platform'
import { ServerResponseError } from '../sync/api'
import { deleteCalendarEvent, fetchCalendar, fetchCalendarChanges, RequestTimeoutError, saveCalendarEvent, type CalendarActor } from '../sync/calendarApi'
import { getSettings, isSyncConfigured } from '../sync/settings'
import { currentMonthKey } from '../utils/format'
import { db, type CalendarMeta, type CalendarOp } from './database'

const LOCAL_ID_PREFIX = 'local-'

const isRetryable = (error: unknown) => error instanceof TypeError || error instanceof ServerResponseError || error instanceof RequestTimeoutError

export const toCalendarError = (error: unknown) => {
  if (error instanceof TypeError) return '인터넷 연결을 확인해 주세요.'
  if (error instanceof ServerResponseError) return `시트 서버가 잠시 응답하지 못했어요. (${error.status})`
  if (error instanceof RequestTimeoutError) return '시트 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.'
  return error instanceof Error ? error.message : '알 수 없는 오류가 났어요.'
}

const isLocalId = (id: string) => id.startsWith(LOCAL_ID_PREFIX)

// 구글 캘린더 일정 번호는 소문자 a~v와 숫자만 쓸 수 있어서, 하이픈을 뺀 UUID(0~9, a~f)를 쓴다.
const newCreateId = () => crypto.randomUUID().replace(/-/g, '')

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

const mergeByDate = (holidays: Holiday[]) => {
  const names = new Map<string, string[]>()
  holidays.forEach(holiday => names.set(holiday.date, [...(names.get(holiday.date) ?? []), holiday.name]))
  return [...names].map(([date, dayNames]) => ({ date, name: dayNames.join(' · ') }))
}

const replaceHolidays = async (start: string, end: string, holidays: Holiday[] | undefined) => {
  if (!holidays) return
  await db.transaction('rw', db.holidays, async () => {
    await db.holidays.where('date').between(start, end, true, true).delete()
    await db.holidays.bulkPut(mergeByDate(holidays))
  })
}

const currentActor = async (): Promise<CalendarActor> => ({
  person: DEVICE_PERSON,
  name: displayName(DEVICE_PERSON, (await db.shared.get('shared'))?.닉네임 ?? {}),
})

const sendOp = async (op: CalendarOp) => {
  if (op.type === 'save') return saveCalendarEvent(getSettings(), op.input, op.scope, await currentActor(), op.createId)
  return deleteCalendarEvent(getSettings(), op.ref, op.scope, await currentActor())
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

const META_KEY = 'sync'

const readMeta = async (): Promise<CalendarMeta> => (await db.calendarMeta.get(META_KEY)) ?? { key: META_KEY }

const writeMeta = async (patch: Partial<CalendarMeta>) => db.calendarMeta.put({ ...(await readMeta()), ...patch })

// 오류 안내의 닫기 버튼. 다음에 보내기가 실패하면 다시 보인다.
export const dismissCalendarError = () => writeMeta({ error: undefined })

// 처음 볼 달과 그 앞뒤 한 달은 먼저 받고, 지난 4개월도 앱에 없으면 미리 받아 둔다.
// 주기 탭은 지난 일정으로 계산해서, 그보다 긴 주기 항목이 있으면 그 주기만큼(최대 1년) 더 받는다.
const VISIBLE_MONTHS = { before: 1, after: 1 }
const PAST_MONTHS = { min: 4, max: 12 }
const BACKFILL_RUN = 4

const pastMonthsToKeep = async () => Math.min(PAST_MONTHS.max, Math.max(PAST_MONTHS.min, longestPeriodMonths(await db.cycles.toArray())))

const loadedMonths = async () => (await db.calendarLoaded.toCollection().primaryKeys()) as string[]

// 이어진 달끼리 한 번에 받아 그 범위를 서버 기준으로 바꿔 끼우고, 받아 둔 달로 기록한다.
const loadMonths = async (months: string[], maxRun?: number) => {
  for (const run of monthRuns(months, maxRun)) {
    const { start } = gridRange(run[0])
    const { end } = gridRange(run.at(-1)!)
    const { events, holidays } = await fetchCalendar(getSettings(), start, end)
    await replaceHolidays(start, end, holidays)
    await replaceRange(start, end, events)
    const fetchedAt = new Date().toISOString()
    await db.calendarLoaded.bulkPut(run.map(monthKey => ({ monthKey, fetchedAt })))
  }
}

// 확인 번호를 먼저 받아 두고 달을 받아야, 그 사이에 바뀐 일정도 다음 확인 때 잡힌다.
const startOver = async (syncToken: string) => {
  await db.calendarLoaded.clear()
  await loadMonths(monthsAround(currentMonthKey(), VISIBLE_MONTHS.before, VISIBLE_MONTHS.after))
  await writeMeta({ syncToken })
}

// 지난 확인 이후 바뀐 일정이 있는 달만 다시 받는다. 다 받은 뒤에야 확인 번호를 넘겨서, 중간에 실패하면 다음에 다시 받는다.
const refresh = async () => {
  const { syncToken } = await readMeta()
  const result = await fetchCalendarChanges(getSettings(), syncToken)
  if (!syncToken || result.reset) {
    await startOver(result.syncToken)
  } else {
    await loadMonths(changedMonths(result.changes ?? [], await db.calendarEvents.toArray(), await loadedMonths()))
    await writeMeta({ syncToken: result.syncToken })
  }
  const loaded = new Set(await loadedMonths())
  const missing = monthsAround(currentMonthKey(), await pastMonthsToKeep(), VISIBLE_MONTHS.after).filter(month => !loaded.has(month))
  await loadMonths(missing, BACKFILL_RUN)
}

const MAX_SYNC_ROUNDS = 3

let running: Promise<void> | null = null

// 보낼 작업을 먼저 보내고, 바뀐 것을 확인해 그 달만 받는다.
// 받기는 조용히 하고 실패하면 다음 확인 때 다시 하며, 사용자에게는 보내지 못한 작업이 있을 때만 알린다.
export const syncCalendar = () => {
  running ??= (async () => {
    try {
      if (!isSyncConfigured(getSettings())) return
      for (let round = 0; round < MAX_SYNC_ROUNDS; round += 1) {
        try {
          await pushOutbox()
        } catch (error) {
          await writeMeta({ error: toCalendarError(error) })
          return
        }
        await writeMeta({ error: undefined })
        await refresh().catch(() => {})
        // 받는 동안 새 작업이 쌓였으면 그것까지 보낸다.
        if ((await db.calendarOutbox.count()) === 0) return
      }
    } finally {
      running = null
    }
  })()
  return running
}

// 아직 받지 않은 달로 넘기면 그 달만 받는다. 처음 확인이 끝나기 전에는 기다렸다가, 확인 번호가 생긴 뒤에 받는다.
export const ensureMonth = async (monthKey: string) => {
  if (!isSyncConfigured(getSettings())) return
  await running
  if (!(await readMeta()).syncToken || (await db.calendarLoaded.get(monthKey))) return
  await loadMonths([monthKey])
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
    await db.calendarOutbox.add({ type: 'save', input, scope, localId, createId: newCreateId() } as CalendarOp)
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

export function useHolidays() {
  const holidays = useLiveQuery(() => db.holidays.toArray(), [])
  return useMemo(() => new Map((holidays ?? []).map(holiday => [holiday.date, holiday.name])), [holidays])
}

export function useCalendarStatus() {
  const meta = useLiveQuery(() => db.calendarMeta.get(META_KEY), [])
  const pendingCount = useLiveQuery(() => db.calendarOutbox.count(), []) ?? 0
  return { error: meta?.error ?? null, pendingCount }
}

// 화면을 열 때·앱으로 돌아올 때·인터넷이 다시 연결될 때 바뀐 것을 확인하고, 아직 받지 않은 달은 넘길 때 받는다.
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
