import { useSyncExternalStore } from 'react'
import type { Person } from '../domain/types'

export type Settings = {
  endpoint: string
  token: string
  defaultPerson: Person
}

const STORAGE_KEY = 'ledger.settings'
const EMPTY: Settings = {
  endpoint: import.meta.env.VITE_SYNC_ENDPOINT ?? '',
  token: import.meta.env.VITE_SYNC_TOKEN ?? '',
  defaultPerson: '쿠리만쥬',
}

const listeners = new Set<() => void>()
let cache: Settings | null = null

export const getSettings = (): Settings => {
  if (cache) return cache
  try {
    cache = { ...EMPTY, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
  } catch {
    cache = EMPTY
  }
  return cache!
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
