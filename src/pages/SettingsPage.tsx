import { App } from '@capacitor/app'
import { useEffect, useMemo, useState } from 'react'
import Segmented from '../components/Segmented'
import TopBar from '../components/TopBar'
import { useSharedSettings, useSyncStatus } from '../db/hooks'
import { saveSharedSettings } from '../db/repository'
import { evaluateAmount } from '../domain/amountExpression'
import { PEOPLE, type SharedSettings } from '../domain/types'
import LockSettingSection from '../lock/LockSettingSection'
import { isCaptureSupported, NotificationCapture, type InstalledApp } from '../native/notificationCapture'
import { decodeConnectCode } from '../sync/connectCode'
import { isSyncConfigured, saveSettings, useSettings } from '../sync/settings'
import { resetSync, syncNow } from '../sync/sync'

const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : '알 수 없는 오류가 발생했어요.')

const formatSyncedAt = (iso: string | null | undefined) => {
  if (!iso) return '아직 동기화하지 않았어요'
  const date = new Date(iso)
  return `마지막 동기화 ${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function SettingsPage() {
  const settings = useSettings()

  return (
    <div className="page">
      <TopBar title="설정" />

      <main className="page-content">
        <SyncSection />

        <GoalSection />

        <section className="card">
          <h2 className="card-title">직접 입력할 때 기본 사람</h2>
          <Segmented
            label="기본 사람"
            options={PEOPLE}
            value={settings.defaultPerson}
            onChange={defaultPerson => saveSettings({ ...settings, defaultPerson })}
          />
        </section>

        {isCaptureSupported() && <CaptureSection />}

        <LockSettingSection />

        <section className="card">
          <h2 className="card-title">카테고리</h2>
          <p className="card-description">카테고리 추가·이름 변경·순서는 구글 시트의 "카테고리" 탭에서 바꾸면 다음 동기화 때 반영돼요.</p>
        </section>
      </main>
    </div>
  )
}

function GoalSection() {
  const shared = useSharedSettings()

  if (!shared) return null
  return <GoalForm key={shared.updatedAt} initial={shared} />
}

function GoalForm({ initial }: { initial: SharedSettings }) {
  const [budgetText, setBudgetText] = useState(initial.월예산 ? String(initial.월예산) : '')
  const [goalText, setGoalText] = useState(initial.월저축목표 ? String(initial.월저축목표) : '')

  const budget = budgetText.trim() ? evaluateAmount(budgetText) : 0
  const goal = goalText.trim() ? evaluateAmount(goalText) : 0
  const isValid = budget !== null && goal !== null && budget >= 0 && goal >= 0
  const isChanged = budget !== initial.월예산 || goal !== initial.월저축목표

  const handleSave = async () => {
    if (!isValid) return
    await saveSharedSettings({ 월예산: budget, 월저축목표: goal })
    syncNow().catch(() => {})
  }

  return (
    <section className="card">
      <h2 className="card-title">예산·저축 목표</h2>
      <p className="card-description">두 사람이 함께 쓰는 값이에요. 저장하면 상대방 폰에도 다음 동기화 때 반영돼요.</p>
      <label className="field">
        <span className="field-label">월 예산 (지출 합계 기준)</span>
        <input className="field-input" inputMode="text" placeholder="예: 3000000" value={budgetText} onChange={event => setBudgetText(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">월 저축 목표</span>
        <input className="field-input" inputMode="text" placeholder="예: 1000000*2" value={goalText} onChange={event => setGoalText(event.target.value)} />
      </label>
      {!isValid && <p className="status status-error">금액을 확인해 주세요.</p>}
      <div className="card-actions">
        <button type="button" className="button button-primary" disabled={!isValid || !isChanged} onClick={handleSave}>
          저장
        </button>
      </div>
    </section>
  )
}

function SyncSection() {
  const settings = useSettings()
  const status = useSyncStatus()

  const [endpoint, setEndpoint] = useState(settings.endpoint)
  const [token, setToken] = useState(settings.token)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  const isChanged = endpoint.trim() !== settings.endpoint || token.trim() !== settings.token

  const handleConnectCode = (code: string) => {
    if (!code.trim()) return
    const decoded = decodeConnectCode(code)
    if (!decoded) {
      setMessage({ tone: 'error', text: '연결 코드가 올바르지 않아요. 전체를 다시 복사해 주세요.' })
      return
    }
    setEndpoint(decoded.endpoint)
    setToken(decoded.token)
    setMessage({ tone: 'success', text: '연결 코드를 읽었어요. 저장하고 동기화를 눌러주세요.' })
  }

  const runSync = async () => {
    setIsSyncing(true)
    setMessage(null)
    try {
      await syncNow()
      setMessage({ tone: 'success', text: '동기화했어요.' })
    } catch (error) {
      setMessage({ tone: 'error', text: toErrorMessage(error) })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleSave = async () => {
    const isNewEndpoint = endpoint.trim() !== settings.endpoint
    saveSettings({ ...settings, endpoint: endpoint.trim(), token: token.trim() })
    if (isNewEndpoint) await resetSync()
    await runSync()
  }

  return (
    <section className="card">
      <h2 className="card-title">구글 시트 동기화</h2>
      {!isSyncConfigured(settings) && (
        <label className="field">
          <span className="field-label">연결 코드 붙여넣기</span>
          <input
            className="field-input"
            placeholder="LEDGER1:로 시작하는 코드"
            onChange={event => handleConnectCode(event.target.value)}
          />
        </label>
      )}
      <label className="field">
        <span className="field-label">Apps Script 웹 앱 URL</span>
        <input
          className="field-input"
          placeholder="https://script.google.com/macros/s/.../exec"
          value={endpoint}
          onChange={event => setEndpoint(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">토큰</span>
        <input className="field-input" type="password" value={token} onChange={event => setToken(event.target.value)} />
      </label>
      <p className="card-description">
        {formatSyncedAt(status?.lastSyncedAt)}
        {status && status.pendingCount > 0 && ` · 보낼 변경 ${status.pendingCount}개`}
      </p>
      {message && <p className={`status status-${message.tone}`}>{message.text}</p>}
      <div className="card-actions">
        {isChanged ? (
          <button type="button" className="button button-primary" disabled={isSyncing || !endpoint || !token} onClick={handleSave}>
            저장하고 동기화
          </button>
        ) : (
          <button type="button" className="button" disabled={isSyncing || !isSyncConfigured(settings)} onClick={runSync}>
            {isSyncing ? '동기화 중...' : '지금 동기화'}
          </button>
        )}
      </div>
    </section>
  )
}

function CaptureSection() {
  const [isGranted, setIsGranted] = useState<boolean>()
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [allowed, setAllowed] = useState<string[]>([])
  const [query, setQuery] = useState('')

  const sortedApps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return apps
      .filter(app => !normalizedQuery || app.label.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => Number(allowed.includes(right.packageName)) - Number(allowed.includes(left.packageName)) || left.label.localeCompare(right.label, 'ko'))
  }, [apps, allowed, query])

  useEffect(() => {
    const checkPermission = () => NotificationCapture.isPermissionGranted().then(result => setIsGranted(result.granted))
    checkPermission()
    NotificationCapture.listApps().then(result => setApps(result.apps))
    NotificationCapture.getAllowedPackages().then(result => setAllowed(result.packages))

    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) checkPermission()
    })
    return () => {
      listener.then(handle => handle.remove())
    }
  }, [])

  const handleToggleApp = async (packageName: string) => {
    const next = allowed.includes(packageName) ? allowed.filter(name => name !== packageName) : [...allowed, packageName]
    setAllowed(next)
    await NotificationCapture.setAllowedPackages({ packages: next })
  }

  const handleOpenPermission = async () => {
    await NotificationCapture.openPermissionSettings()
  }

  return (
    <section className="card">
      <h2 className="card-title">결제 알림 수집</h2>
      <div className="setting-row">
        <span>알림 접근 권한</span>
        {isGranted ? (
          <span className="badge badge-on">허용됨</span>
        ) : (
          <button type="button" className="button" onClick={handleOpenPermission}>
            권한 허용하러 가기
          </button>
        )}
      </div>
      <p className="card-description">
        고른 앱의 알림 중 금액이 들어간 것만 폰 안에 모아요. 카드사·은행 앱, 카카오톡, 메시지, 토스를 골라주세요. ({allowed.length}개 선택)
      </p>
      <input className="field-input" placeholder="앱 이름 검색" value={query} onChange={event => setQuery(event.target.value)} />
      <ul className="app-list">
        {sortedApps.map(app => (
          <li key={app.packageName}>
            <label className="checkbox app-item">
              <input type="checkbox" checked={allowed.includes(app.packageName)} onChange={() => handleToggleApp(app.packageName)} />
              <span>{app.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default SettingsPage
