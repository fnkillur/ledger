import { useSyncExternalStore } from 'react'
import type { PersonFilter } from '../domain/stats'
import { currentMonthKey } from './format'

type ViewState = { monthKey: string; personFilter: PersonFilter }

let state: ViewState = { monthKey: currentMonthKey(), personFilter: '합산' }
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
