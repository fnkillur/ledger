import { useState } from 'react'
import { authenticate, setLockEnabled, toAuthErrorMessage, useLockAvailable, useLockEnabled } from './appLock'

const getDescription = (isAvailable: boolean | undefined) => {
  if (isAvailable === undefined) return '확인 중...'
  if (isAvailable) return '앱을 열 때와 1분 이상 다른 앱을 쓰다 돌아왔을 때 지문이나 폰 비밀번호로 잠금을 풀어요.'
  return '폰에 화면 잠금(지문·PIN·패턴·비밀번호)이 설정되어 있어야 쓸 수 있어요. 웹에서는 지원하지 않아요.'
}

function LockSettingSection() {
  const isLockEnabled = useLockEnabled()
  const isAvailable = useLockAvailable()

  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleToggle = async () => {
    setErrorMessage(null)
    if (isLockEnabled) {
      setLockEnabled(false)
      return
    }
    try {
      await authenticate()
      setLockEnabled(true)
    } catch (error) {
      setErrorMessage(toAuthErrorMessage(error))
    }
  }

  return (
    <section className="data-section">
      <div className="setting-row">
        <h2>지문 잠금</h2>
        <button
          type="button"
          role="switch"
          aria-checked={isLockEnabled}
          aria-label="지문 잠금"
          className="switch"
          disabled={!isAvailable}
          onClick={handleToggle}
        />
      </div>
      <p>{getDescription(isAvailable)}</p>
      {errorMessage && <p className="status status-error">{errorMessage}</p>}
    </section>
  )
}

export default LockSettingSection
