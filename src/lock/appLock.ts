import { BiometricAuth, BiometryError, BiometryErrorType } from '@aparajita/capacitor-biometric-auth'
import { Capacitor } from '@capacitor/core'
import { useEffect, useState, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'ledger.lockEnabled'

const listeners = new Set<() => void>()

const readLockEnabled = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export const isLockEnabled = () => Capacitor.isNativePlatform() && readLockEnabled()

export const setLockEnabled = (enabled: boolean) => {
  localStorage.setItem(STORAGE_KEY, String(enabled))
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLockEnabled() {
  return useSyncExternalStore(subscribe, isLockEnabled)
}

export function useLockAvailable() {
  const [isAvailable, setIsAvailable] = useState(() => (Capacitor.isNativePlatform() ? undefined : false))

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    BiometricAuth.checkBiometry()
      .then(result => setIsAvailable(result.deviceIsSecure))
      .catch(() => setIsAvailable(false))
  }, [])

  return isAvailable
}

export const authenticate = () =>
  BiometricAuth.authenticate({
    allowDeviceCredential: true,
    androidTitle: '가계부 잠금 해제',
    androidSubtitle: '지문 또는 화면 잠금으로 열어주세요',
  })

const isUserCancel = (code: BiometryErrorType) =>
  code === BiometryErrorType.userCancel || code === BiometryErrorType.appCancel || code === BiometryErrorType.systemCancel

export const toAuthErrorMessage = (error: unknown) => {
  if (!(error instanceof BiometryError)) return '인증에 실패했어요. 다시 시도해 주세요.'
  if (isUserCancel(error.code)) return null
  if (error.code === BiometryErrorType.biometryLockout) return '시도 횟수를 초과했어요. 잠시 후 다시 시도해 주세요.'
  if (error.code === BiometryErrorType.noDeviceCredential || error.code === BiometryErrorType.passcodeNotSet) {
    return '폰에 화면 잠금이 설정되어 있지 않아요.'
  }
  return '인증에 실패했어요. 다시 시도해 주세요.'
}
