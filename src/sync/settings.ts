import { useSyncExternalStore } from 'react'
import type { Person } from '../domain/types'
import { IS_WEB_BUILD } from '../platform'

export type Settings = {
  endpoint: string
  token: string
  defaultPerson: Person
}

const STORAGE_KEY = 'ledger.settings'
const EMPTY: Settings = {
  endpoint: import.meta.env.VITE_SYNC_ENDPOINT ?? '',
  token: import.meta.env.VITE_SYNC_TOKEN ?? '',
  defaultPerson: IS_WEB_BUILD ? '우사기' : '쿠리만쥬',
}

const listeners = new Set<() => void>()
let cache: Settings | null = null

const readStored = (): Partial<Settings> => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

// 웹 버전은 우사기 전용이라 기본 사람을 고정한다.
export const getSettings = (): Settings => {
  cache ??= { ...EMPTY, ...readStored(), ...(IS_WEB_BUILD ? { defaultPerson: '우사기' as const } : {}) }
  return cache
}

export const saveSettings = (settings: Settings) => {
  cache = settings
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSettings() {
  return useSyncExternalStore(subscribe, getSettings)
}

export const isSyncConfigured = (settings: Settings) => settings.endpoint !== '' && settings.token !== ''
