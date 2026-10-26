import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { gridRange } from '../domain/calendar'
import { fetchCalendar } from '../sync/calendarApi'
import { getSettings, isSyncConfigured, type Settings } from '../sync/settings'
import { db } from './database'

export const toCalendarError = (error: unknown) => {
  if (error instanceof TypeError) return '인터넷 연결을 확인해 주세요.'
  return error instanceof Error ? error.message : '알 수 없는 오류가 났어요.'
}

export const refreshCalendarMonth = async (monthKey: string) => {
  const settings = getSettings()
  if (!isSyncConfigured(settings)) return
  const { start, end } = gridRange(monthKey)
  const events = await fetchCalendar(settings, start, end)
  await db.calendarMonths.put({ monthKey, events, fetchedAt: new Date().toISOString() })
}

// 반복 일정을 고치면 여러 달이 바뀔 수 있어서, 보던 달만 바로 다시 받고 나머지 캐시는 비운다.
export const saveAndRefresh = async <T>(monthKey: string, write: (settings: Settings) => Promise<T>) => {
  const settings = getSettings()
  if (!isSyncConfigured(settings)) throw new Error('구글 시트와 아직 연결되지 않았어요. 설정에서 연결 코드를 붙여넣어 주세요.')
  const result = await write(settings)
  await db.calendarMonths.where('monthKey').notEqual(monthKey).delete()
  await refreshCalendarMonth(monthKey).catch(() => {})
  return result
}

export function useCalendarMonth(monthKey: string) {
  const cached = useLiveQuery(() => db.calendarMonths.get(monthKey), [monthKey])

  // 달을 빨리 넘기면 이전 달의 늦은 응답이 올 수 있어서, 오류는 어느 달 것인지 같이 기억한다.
  const [failure, setFailure] = useState<{ monthKey: string; message: string } | null>(null)

  const error = failure?.monthKey === monthKey ? failure.message : null

  const refresh = useCallback(
    () =>
      refreshCalendarMonth(monthKey).then(
        () => setFailure(null),
        caught => setFailure({ monthKey, message: toCalendarError(caught) }),
      ),
    [monthKey],
  )

  useEffect(() => {
    let isCurrent = true
    refreshCalendarMonth(monthKey).then(
      () => isCurrent && setFailure(null),
      caught => isCurrent && setFailure({ monthKey, message: toCalendarError(caught) }),
    )
    const handleVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', handleVisible)
    return () => {
      isCurrent = false
      document.removeEventListener('visibilitychange', handleVisible)
    }
  }, [monthKey, refresh])

  return { events: cached?.events ?? [], error, refresh }
}
