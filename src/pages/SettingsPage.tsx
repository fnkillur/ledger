import { App } from '@capacitor/app'
import { CopyIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import FieldHint from '../components/FieldHint'
import PersonAvatar from '../components/PersonAvatar'
import PersonToggle from '../components/PersonToggle'
import TopBar from '../components/TopBar'
import { useSharedSettings, useSyncStatus } from '../db/hooks'
import { saveSharedSettings } from '../db/repository'
import { cleanNickname, NICKNAME_MAX_LENGTH } from '../domain/nickname'
import { PEOPLE, type Person } from '../domain/types'
import LockSettingSection from '../lock/LockSettingSection'
import { isCaptureSupported, NotificationCapture, type InstalledApp } from '../native/notificationCapture'
import { decodeConnectCode, encodeConnectCode } from '../sync/connectCode'
import { IS_WEB_BUILD } from '../platform'
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
  const shared = useSharedSettings()
  const syncStatus = useSyncStatus()

  // 저장된 값을 다 불러온 뒤에 그려서, 칸이 비었다가 채워지거나 아래 칸이 밀리는 깜빡임을 없앤다.
  const isReady = shared !== undefined && syncStatus !== undefined

  return (
    <div className="page">
      <TopBar title="설정" />

      <main className="page-content settings-content" hidden={!isReady}>
        <h2 className="settings-group">동기화</h2>
        <SyncSection />

        <h2 className="settings-group">가계부</h2>
        <NicknameSection />
        {!IS_WEB_BUILD && (
          <section className="form-group">
            <div className="form-row">
              <span className="form-row-text">
                기본 사람
                <small>직접 입력할 때</small>
              </span>
              <PersonToggle value={settings.defaultPerson} onChange={defaultPerson => saveSettings({ ...settings, defaultPerson })} />
            </div>
          </section>
        )}

        {isCaptureSupported() && (
          <>
            <h2 className="settings-group">알림 수집</h2>
            <CaptureSection />
          </>
        )}

        {!IS_WEB_BUILD && (
          <>
            <h2 className="settings-group">보안</h2>
            <LockSettingSection />
          </>
        )}

        <h2 className="settings-group">카테고리</h2>
        <p className="settings-note">
          카테고리 추가·이름·순서, 고정비·개인지출·통계제외 여부는 구글 시트의 "카테고리" 탭에서 바꾸면 다음 동기화 때 반영돼요.
        </p>
      </main>
    </div>
  )
}

function NicknameSection() {
  const shared = useSharedSettings()

  const [savedPerson, setSavedPerson] = useState<Person | null>(null)

  if (!shared) return null

  const handleSave = async (person: Person, nickname: string | undefined) => {
    const 닉네임 = { ...shared.닉네임, [person]: nickname }
    if (!nickname) delete 닉네임[person]
    await saveSharedSettings({ 월예산: shared.월예산, 월저축목표: shared.월저축목표, 닉네임 })
    setSavedPerson(person)
    syncNow().catch(() => {})
  }

  return (
    <>
      <section className="form-group" aria-label="닉네임">
        {PEOPLE.map(person => (
          <NicknameField
            key={`${person}-${shared.닉네임?.[person] ?? ''}`}
            person={person}
            saved={shared.닉네임?.[person] ?? ''}
            isJustSaved={savedPerson === person}
            onSave={nickname => handleSave(person, nickname)}
            onEdit={() => setSavedPerson(null)}
          />
        ))}
      </section>
      <p className="settings-note">닉네임은 두 사람 화면에 모두 보여요. 비우면 원래 이름으로 돌아가요.</p>
    </>
  )
}

type NicknameFieldProps = {
  person: Person
  saved: string
  isJustSaved: boolean
  onSave: (nickname: string | undefined) => Promise<void>
  onEdit: () => void
}

function NicknameField({ person, saved, isJustSaved, onSave, onEdit }: NicknameFieldProps) {
  const [text, setText] = useState(saved)

  const handleCommit = async () => {
    const nickname = cleanNickname(text)
    if ((nickname ?? '') === saved) return
    if (text.trim() !== '' && !nickname) return
    await onSave(nickname)
  }

  return (
    <label className="form-row nickname-row">
      <PersonAvatar person={person} size={28} />
      <span className="nickname-input-wrap">
        <input
          className="row-input"
          value={text}
          placeholder={person}
          maxLength={NICKNAME_MAX_LENGTH}
          aria-label={`${person} 닉네임`}
          onChange={event => {
            setText(event.target.value)
            onEdit()
          }}
          onBlur={handleCommit}
          onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()}
        />
        {isJustSaved && <FieldHint tone="result">저장했어요</FieldHint>}
        {text.trim() !== '' && !cleanNickname(text) && <FieldHint tone="error">숫자만으로는 만들 수 없어요</FieldHint>}
      </span>
    </label>
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

  // 홈 화면 앱과 Safari처럼 저장 공간이 따로인 곳을 연결할 때, 이미 연결된 기기에서 코드를 복사해 간다.
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(encodeConnectCode(settings.endpoint, settings.token))
      setMessage({ tone: 'success', text: '연결 코드를 복사했어요. 연결할 기기의 설정에 붙여넣어 주세요.' })
    } catch {
      setMessage({ tone: 'error', text: '복사하지 못했어요. 다시 눌러 주세요.' })
    }
  }

  const handleSave = async () => {
    const isNewEndpoint = endpoint.trim() !== settings.endpoint
    saveSettings({ ...settings, endpoint: endpoint.trim(), token: token.trim() })
    if (isNewEndpoint) await resetSync()
    await runSync()
  }

  const isConfigured = isSyncConfigured(settings)
  const hasPending = (status?.pendingCount ?? 0) > 0

  return (
    <section className="form-group settings-card">
      {isConfigured ? (
        <div className="sync-status">
          <span className={`sync-dot${hasPending ? ' is-pending' : ''}`} aria-hidden="true" />
          <div className="sync-status-text">
            <strong>{hasPending ? `보낼 변경 ${status!.pendingCount}개` : '구글 시트와 연결됨'}</strong>
            <span>{formatSyncedAt(status?.lastSyncedAt)}</span>
          </div>
          <button type="button" className="button button-small" disabled={isSyncing} onClick={runSync}>
            {isSyncing ? '동기화 중…' : '지금 동기화'}
          </button>
        </div>
      ) : (
        <label className="field">
          <span className="field-label">구글 시트 연결 코드</span>
          <input className="field-input" placeholder="LEDGER1:로 시작하는 코드" onChange={event => handleConnectCode(event.target.value)} />
        </label>
      )}

      {isConfigured && (
        <button type="button" className="text-button text-primary copy-code-button" onClick={handleCopyCode}>
          <CopyIcon size={16} weight="bold" aria-hidden="true" />
          다른 기기 연결 코드 복사
        </button>
      )}

      {message && <p className={`status status-${message.tone}`}>{message.text}</p>}

      {/* 웹은 우사기 전용이라 연결된 뒤에는 연결 정보를 바꾸지 못하게 숨긴다. */}
      {!(IS_WEB_BUILD && isConfigured) && (
        <details className="sync-details" open={!isConfigured && isChanged}>
          <summary>{isConfigured ? '연결 정보 바꾸기' : '직접 입력하기'}</summary>
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
        </details>
      )}

      {isChanged && (
        <button type="button" className="button button-primary button-block" disabled={isSyncing || !endpoint || !token} onClick={handleSave}>
          저장하고 동기화
        </button>
      )}
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
      .sort(
        (left, right) =>
          Number(allowed.includes(right.packageName)) - Number(allowed.includes(left.packageName)) ||
          left.label.localeCompare(right.label, 'ko'),
      )
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
    <section className="form-group settings-card">
      <div className="setting-row">
        <span>알림 접근 권한</span>
        {isGranted ? (
          <span className="badge badge-on">허용됨</span>
        ) : (
          <button type="button" className="button button-small" onClick={handleOpenPermission}>
            허용하러 가기
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
