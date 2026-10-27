import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
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

// 시작 화면(아이콘 + 이름)은 너무 빨리 사라지면 깜빡임처럼 보여서, 켠 뒤 최소 이만큼은 보여 준다.
const BOOT_SPLASH_MIN_MS = 1000
const BOOT_SPLASH_FADE_MS = 280

export const hideBootSplash = () => {
  const splash = document.getElementById('boot-splash')
  if (!splash) return
  // 웹 시작 화면이 실제로 그려진 다음 프레임에 시스템 시작 화면을 내려야, 같은 자리의 아이콘이 끊기지 않고 이어진다.
  if (Capacitor.isNativePlatform()) {
    requestAnimationFrame(() => requestAnimationFrame(() => SplashScreen.hide({ fadeOutDuration: 0 })))
  }
  window.setTimeout(
    () => {
      splash.classList.add('is-hiding')
      window.setTimeout(() => splash.remove(), BOOT_SPLASH_FADE_MS)
    },
    Math.max(0, BOOT_SPLASH_MIN_MS - performance.now()),
  )
}
