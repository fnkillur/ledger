import { useSyncExternalStore } from 'react'
import { currentMonthKey } from './format'

export type PeriodType = '월별' | '연도별'

type ViewState = { periodType: PeriodType; monthKey: string }

let state: ViewState = { periodType: '월별', monthKey: currentMonthKey() }
const listeners = new Set<() => void>()

export const updateViewState = (patch: Partial<ViewState>) => {
  state = { ...state, ...patch }
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let calendarMonthKey = currentMonthKey()
const calendarListeners = new Set<() => void>()

// 캘린더가 보는 달은 내역 탭의 기간과 따로 기억한다.
export const setCalendarMonth = (monthKey: string) => {
  calendarMonthKey = monthKey
  calendarListeners.forEach(listener => listener())
}

const subscribeCalendar = (listener: () => void) => {
  calendarListeners.add(listener)
  return () => calendarListeners.delete(listener)
}

export function useCalendarMonthKey() {
  return useSyncExternalStore(subscribeCalendar, () => calendarMonthKey)
}

export function useViewState() {
  return useSyncExternalStore(subscribe, () => state)
}
