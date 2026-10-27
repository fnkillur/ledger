import { App } from '@capacitor/app'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Sticker from '../components/Sticker'
import { authenticate, toAuthErrorMessage, useLockEnabled } from './appLock'

const RELOCK_AFTER_MS = 60 * 1000

function AppLockGate({ children }: { children: ReactNode }) {
  const isLockEnabled = useLockEnabled()

  const [isLocked, setIsLocked] = useState(isLockEnabled)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const backgroundAtRef = useRef<number | null>(null)
  const isAuthenticatingRef = useRef(false)
  const isLockEnabledOnLaunchRef = useRef(isLockEnabled)

  const handleUnlock = useCallback(async () => {
    if (isAuthenticatingRef.current) return
    isAuthenticatingRef.current = true
    try {
      await authenticate()
      setErrorMessage(null)
      setIsLocked(false)
    } catch (error) {
      setErrorMessage(toAuthErrorMessage(error))
    } finally {
      isAuthenticatingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!isLockEnabled) return

    // 지문/비밀번호 확인 화면이 떠 있는 동안에도 앱이 백그라운드로 간 것처럼 이벤트가 온다.
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isAuthenticatingRef.current) return
      if (!isActive) {
        backgroundAtRef.current = Date.now()
        return
      }
      const backgroundAt = backgroundAtRef.current
      backgroundAtRef.current = null
      if (backgroundAt === null || Date.now() - backgroundAt < RELOCK_AFTER_MS) return
      setIsLocked(true)
      handleUnlock()
    })

    return () => {
      listener.then(handle => handle.remove())
    }
  }, [isLockEnabled, handleUnlock])

  useEffect(() => {
    if (isLockEnabledOnLaunchRef.current) handleUnlock()
  }, [handleUnlock])

  return (
    <>
      <div hidden={isLocked}>{children}</div>
      {isLocked && <LockScreen errorMessage={errorMessage} onUnlock={handleUnlock} />}
    </>
  )
}

type LockScreenProps = {
  errorMessage: string | null
  onUnlock: () => void
}

function LockScreen({ errorMessage, onUnlock }: LockScreenProps) {
  return (
    <div className="lock-screen">
      <Sticker name="default" size={120} />
      <p className="lock-title">가뿌까가 잠겨 있어요</p>
      {errorMessage && <p className="lock-error">{errorMessage}</p>}
      <button type="button" className="button" onClick={onUnlock}>
        잠금 해제
      </button>
    </div>
  )
}

export default AppLockGate
