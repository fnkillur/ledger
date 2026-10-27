import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { DEVICE_PERSON, IS_WEB_BUILD } from '../platform'
import { registerPushToken, unregisterPushToken } from '../sync/calendarApi'
import { getSettings, isSyncConfigured } from '../sync/settings'

const STORAGE_KEY = 'ledger.push'

type Stored = { enabled: boolean; token?: string }

export type PushSupport = 'native' | 'web' | 'needs-install' | 'unsupported'

const readStored = (): Stored => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{"enabled":false}')
  } catch {
    return { enabled: false }
  }
}

const writeStored = (stored: Stored) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // 저장 공간을 못 쓰면 다음 실행 때 다시 켜면 된다.
  }
}

export const isPushEnabled = () => readStored().enabled

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

// 아이폰은 홈 화면에 추가한 웹앱에서만 푸시를 받을 수 있다.
export const getPushSupport = (): PushSupport => {
  if (Capacitor.isNativePlatform()) return 'native'
  if (!IS_WEB_BUILD || !import.meta.env.VITE_FIREBASE_VAPID_KEY) return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return isStandalone() ? 'unsupported' : 'needs-install'
  return 'web'
}

const sendToken = async (token: string) => {
  const settings = getSettings()
  if (!isSyncConfigured(settings)) throw new Error('구글 시트와 먼저 연결해 주세요.')
  await registerPushToken(settings, { pushToken: token, person: DEVICE_PERSON, platform: Capacitor.isNativePlatform() ? 'android' : 'web' })
  writeStored({ enabled: true, token })
}

const nativeToken = () =>
  new Promise<string>((resolve, reject) => {
    const handles = [
      PushNotifications.addListener('registration', ({ value }) => {
        handles.forEach(handle => handle.then(listener => listener.remove()))
        resolve(value)
      }),
      PushNotifications.addListener('registrationError', ({ error }) => {
        handles.forEach(handle => handle.then(listener => listener.remove()))
        reject(new Error(error))
      }),
    ]
    PushNotifications.register()
  })

const webToken = async () => {
  const [{ initializeApp }, { getMessaging, getToken }] = await Promise.all([import('firebase/app'), import('firebase/messaging')])
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })
  const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}push-sw.js`)
  return getToken(getMessaging(app), { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration })
}

// 알림 허용 창은 사용자가 누른 뒤에 띄워야 해서(아이폰), 설정의 스위치에서만 부른다.
export const enablePush = async () => {
  if (Capacitor.isNativePlatform()) {
    const { receive } = await PushNotifications.requestPermissions()
    if (receive !== 'granted') throw new Error('폰 설정에서 가뿌까 알림을 허용해 주세요.')
    await sendToken(await nativeToken())
    return
  }
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('알림을 허용해야 받을 수 있어요.')
  await sendToken(await webToken())
}

export const disablePush = async () => {
  const { token } = readStored()
  writeStored({ enabled: false })
  if (Capacitor.isNativePlatform()) await PushNotifications.unregister().catch(() => {})
  if (token) await unregisterPushToken(getSettings(), token).catch(() => {})
}

// 토큰은 가끔 바뀌므로, 켜 둔 기기는 앱을 열 때마다 서버에 다시 알려 준다.
export const refreshPush = async () => {
  if (!isPushEnabled() || getPushSupport() === 'unsupported' || getPushSupport() === 'needs-install') return
  const token = Capacitor.isNativePlatform() ? await nativeToken() : await webToken()
  await sendToken(token)
}

type PushOpenHandler = (dateKey: string) => void

// 안드로이드에서 알림을 누르면 그 날짜를 열고, 앱을 보는 중에 알림이 오면 캘린더를 새로 맞춘다.
export const listenNativePush = (onOpen: PushOpenHandler, onReceive: () => void) => {
  if (!Capacitor.isNativePlatform()) return
  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const date = notification.data?.date
    if (typeof date === 'string' && date) onOpen(date)
  })
  PushNotifications.addListener('pushNotificationReceived', onReceive)
}
