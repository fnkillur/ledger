import { useMemo, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import ConfirmSheet from '../components/ConfirmSheet'
import EmptyState from '../components/EmptyState'
import TopBar from '../components/TopBar'
import PersonAvatar from '../components/PersonAvatar'
import { markCapture, toTransactionInput } from '../db/captures'
import type { CaptureItem } from '../db/database'
import { useCategories, usePendingCaptures, usePersonName, useRecentInputs, useUncategorized } from '../db/hooks'
import { saveRule, saveTransaction } from '../db/repository'
import { UNCATEGORIZED, type Transaction } from '../domain/types'
import { isCaptureSupported } from '../native/notificationCapture'
import { IS_WEB_BUILD } from '../platform'
import { getSettings } from '../sync/settings'
import { syncNow } from '../sync/sync'
import { formatDayLabel, formatTime, formatWon } from '../utils/format'

function InboxPage() {
  const navigate = useNavigate()

  const captures = usePendingCaptures()
  const uncategorized = useUncategorized()

  const [isConfirmingIgnoreAll, setIsConfirmingIgnoreAll] = useState(false)

  const waiting = captures.filter(capture => capture.status === '대기')
  const duplicates = captures.filter(capture => capture.status === '중복')

  const handleRecord = async (capture: CaptureItem) => {
    const draft = await toTransactionInput(capture, capture.person ?? getSettings().defaultPerson)
    navigate('/tx/new', { state: { draft, captureKey: capture.key } })
  }

  const handleIgnore = async (capture: CaptureItem) => {
    await markCapture(capture.key, '무시')
    syncNow().catch(() => {})
  }

  const handleIgnoreAll = async () => {
    setIsConfirmingIgnoreAll(false)
    await Promise.all(waiting.map(capture => markCapture(capture.key, '무시')))
    syncNow().catch(() => {})
  }

  const handleIgnoreAllDuplicates = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    Promise.all(duplicates.map(capture => markCapture(capture.key, '무시')))
  }

  return (
    <div className="page">
      <TopBar title="수집함" />

      <main className="page-content">
        {(isCaptureSupported() || waiting.length > 0 || duplicates.length > 0 || IS_WEB_BUILD) && (
          <section className="inbox-section">
            <h2 className="section-title">
              결제 알림 <span className="count">{waiting.length}</span>
              {waiting.length > 1 && (
                <button type="button" className="text-button section-action" onClick={() => setIsConfirmingIgnoreAll(true)}>
                  모두 무시
                </button>
              )}
            </h2>
            {waiting.length === 0 && (
              <p className="empty-inline">
                {isCaptureSupported() ? (
                  <>
                    새 결제 알림이 없어요. 알림 수집 설정은 <Link to="/settings">설정</Link>에서 할 수 있어요.
                  </>
                ) : (
                  '새 결제 문자가 없어요. iOS 단축어로 보낸 카드 결제 문자가 여기에 모여요.'
                )}
              </p>
            )}
            <ul className="capture-list">
              {waiting.map(capture => (
                <CaptureCard key={capture.key} capture={capture} onRecord={handleRecord} onIgnore={handleIgnore} />
              ))}
            </ul>

            {duplicates.length > 0 && (
              <details className="duplicates">
                <summary>
                  중복으로 보이는 알림 {duplicates.length}개
                  <button type="button" className="text-button" onClick={handleIgnoreAllDuplicates}>
                    모두 무시
                  </button>
                </summary>
                <ul className="capture-list">
                  {duplicates.map(capture => (
                    <CaptureCard key={capture.key} capture={capture} onRecord={handleRecord} onIgnore={handleIgnore} />
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        <section className="inbox-section">
          <h2 className="section-title">
            카테고리 없는 내역 <span className="count">{uncategorized.length}</span>
          </h2>
          {uncategorized.length === 0 ? (
            <EmptyState sticker="dance">모두 분류됐어요!</EmptyState>
          ) : (
            <ul className="capture-list">
              {uncategorized.map(transaction => (
                <QuickClassifyCard key={transaction.id} transaction={transaction} />
              ))}
            </ul>
          )}
        </section>
      </main>

      {isConfirmingIgnoreAll && (
        <ConfirmSheet
          message={`결제 알림 ${waiting.length}개를 모두 무시할까요?`}
          confirmLabel="모두 무시"
          onConfirm={handleIgnoreAll}
          onCancel={() => setIsConfirmingIgnoreAll(false)}
        />
      )}
    </div>
  )
}

type CaptureCardProps = {
  capture: CaptureItem
  onRecord: (capture: CaptureItem) => void
  onIgnore: (capture: CaptureItem) => void
}

function CaptureCard({ capture, onRecord, onIgnore }: CaptureCardProps) {
  const personName = usePersonName()

  const { parsed } = capture

  return (
    <li className="capture-card">
      <div className="capture-header">
        <span className="capture-app">
          {capture.person && <PersonAvatar person={capture.person} size={14} />}
          {capture.person ? `${personName(capture.person)} · ${capture.appLabel}` : capture.appLabel}
        </span>
        <span className="capture-time">
          {formatDayLabel(parsed.occurredAt)} {formatTime(parsed.occurredAt)}
        </span>
      </div>
      <div className="capture-summary">
        <strong className={`amount amount-${parsed.kind}`}>
          {parsed.isCancel && '취소 '}
          {parsed.kind === '수입' ? '+' : ''}
          {formatWon(parsed.amount)}
        </strong>
        <span className="capture-merchant">{parsed.merchant || parsed.kind}</span>
      </div>
      <details className="capture-raw">
        <summary>원문 보기</summary>
        <p>
          {capture.title} {capture.text}
        </p>
      </details>
      <div className="capture-actions">
        <button type="button" className="button" onClick={() => onIgnore(capture)}>
          무시
        </button>
        <button type="button" className="button button-primary" onClick={() => onRecord(capture)}>
          기록하기
        </button>
      </div>
    </li>
  )
}

const QUICK_CATEGORY_COUNT = 8

// 카테고리 없는 내역을 열지 않고 바로 분류한다. 가맹점이 있으면 다음부터 자동 분류되게 규칙도 남긴다.
function QuickClassifyCard({ transaction }: { transaction: Transaction }) {
  const categories = useCategories()
  const recent = useRecentInputs('지출')

  const candidates = useMemo(() => {
    const expense = categories.filter(category => category.kind === transaction.kind && !category.excluded && category.name !== UNCATEGORIZED)
    const recentNames = recent.categories.filter(name => expense.some(category => category.name === name))
    const rest = expense.filter(category => !recentNames.includes(category.name)).map(category => category.name)
    return [...recentNames, ...rest].slice(0, QUICK_CATEGORY_COUNT)
  }, [categories, recent.categories, transaction.kind])

  const handlePick = async (categoryName: string) => {
    const category = categories.find(item => item.name === categoryName)
    await saveTransaction({ ...transaction, category: categoryName, scope: category?.personal ? '개인' : '공동' }, transaction.id)
    if (transaction.merchant.trim()) await saveRule(transaction.merchant, categoryName)
    syncNow().catch(() => {})
  }

  return (
    <li className="capture-card">
      <div className="capture-header">
        <span className="capture-app">
          <PersonAvatar person={transaction.person} size={14} /> {transaction.person}
        </span>
        <span className="capture-time">
          {formatDayLabel(transaction.occurredAt)} {formatTime(transaction.occurredAt)}
        </span>
      </div>
      <div className="capture-summary">
        <strong className="amount">{formatWon(transaction.amount)}</strong>
        <span className="capture-merchant">{transaction.merchant || '내용 없음'}</span>
      </div>
      <div className="quick-chips" role="group" aria-label="카테고리 고르기">
        {candidates.map(name => (
          <button key={name} type="button" className="chip" onClick={() => handlePick(name)}>
            {categories.find(category => category.name === name)?.icon} {name}
          </button>
        ))}
        <Link to={`/tx/${transaction.id}`} className="chip chip-more">
          더 보기
        </Link>
      </div>
    </li>
  )
}

export default InboxPage
