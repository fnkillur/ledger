import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import TopBar from '../components/TopBar'
import TransactionRow from '../components/TransactionRow'
import { markCapture, toTransactionInput } from '../db/captures'
import type { CaptureItem } from '../db/database'
import { usePendingCaptures, useUncategorized } from '../db/hooks'
import { isCaptureSupported } from '../native/notificationCapture'
import { getSettings } from '../sync/settings'
import { formatDayLabel, formatTime, formatWon } from '../utils/format'

function InboxPage() {
  const navigate = useNavigate()

  const captures = usePendingCaptures()
  const uncategorized = useUncategorized()

  const waiting = captures.filter(capture => capture.status === '대기')
  const duplicates = captures.filter(capture => capture.status === '중복')

  const handleRecord = async (capture: CaptureItem) => {
    const draft = await toTransactionInput(capture, getSettings().defaultPerson)
    navigate('/tx/new', { state: { draft, captureKey: capture.key } })
  }

  const handleIgnore = (capture: CaptureItem) => markCapture(capture.key, '무시')

  const handleIgnoreAllDuplicates = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    Promise.all(duplicates.map(capture => markCapture(capture.key, '무시')))
  }

  return (
    <div className="page">
      <TopBar title="수집함" />

      <main className="page-content">
        {isCaptureSupported() && (
          <section className="inbox-section">
            <h2 className="section-title">
              결제 알림 <span className="count">{waiting.length}</span>
            </h2>
            {waiting.length === 0 && (
              <p className="empty-inline">
                새 결제 알림이 없어요. 알림 수집 설정은 <Link to="/settings">설정</Link>에서 할 수 있어요.
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
            <p className="empty-inline">모두 분류됐어요.</p>
          ) : (
            <ul className="tx-list">
              {uncategorized.map(transaction => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

type CaptureCardProps = {
  capture: CaptureItem
  onRecord: (capture: CaptureItem) => void
  onIgnore: (capture: CaptureItem) => void
}

function CaptureCard({ capture, onRecord, onIgnore }: CaptureCardProps) {
  const { parsed } = capture

  return (
    <li className="capture-card">
      <div className="capture-header">
        <span className="capture-app">{capture.appLabel}</span>
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
      <p className="capture-raw">
        {capture.title} {capture.text}
      </p>
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

export default InboxPage
