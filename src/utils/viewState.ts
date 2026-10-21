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

export function useViewState() {
  return useSyncExternalStore(subscribe, () => state)
}
