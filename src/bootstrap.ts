import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { pullNativeCaptures } from './db/captures'
import { ensureCategories, syncNow } from './sync/sync'

const refresh = async () => {
  await pullNativeCaptures().catch(() => 0)
  await syncNow().catch(() => {})
}

export const bootstrap = async () => {
  navigator.storage?.persist?.()
  await ensureCategories()
  refresh()

  if (Capacitor.isNativePlatform()) {
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) refresh()
    })
    return
  }
  window.addEventListener('focus', refresh)
}
