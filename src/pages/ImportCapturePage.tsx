import { CameraIcon, LockSimpleIcon } from '@phosphor-icons/react'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router'
import { celebrate } from '../celebration/store'
import CategoryIcon from '../components/CategoryIcon'
import EmptyState from '../components/EmptyState'
import PersonAvatar from '../components/PersonAvatar'
import PersonToggle from '../components/PersonToggle'
import Sticker from '../components/Sticker'
import TopBar from '../components/TopBar'
import { db } from '../db/database'
import { useCategories, usePersonName, useRules } from '../db/hooks'
import { saveRule, saveTransaction } from '../db/repository'
import { parseAlimtalkCapture, type CapturedPayment } from '../domain/alimtalkCapture'
import { classifyMerchant, suggestCategory } from '../domain/classify'
import { UNCATEGORIZED, type Category, type Person } from '../domain/types'
import { recognizeImages, type OcrProgress } from '../ocr/recognize'
import { IS_WEB_BUILD } from '../platform'
import { LIST_PATH } from '../paths'
import { getSettings } from '../sync/settings'
import { syncNow } from '../sync/sync'
import { formatShortDay, formatTime, formatWon, toDateKey } from '../utils/format'

type Candidate = { id: number; payment: CapturedPayment; category: string; isChecked: boolean; isDuplicate: boolean }

const DAY_MS = 24 * 60 * 60 * 1000

const signedAmount = (payment: CapturedPayment) => (payment.isCancel ? -payment.amount : payment.amount)

// 같은 날 같은 금액이 이미 있으면 직접 입력했거나 앱이 먼저 받은 결제일 가능성이 커서 기본으로 빼 둔다.
const findDuplicates = async (payments: CapturedPayment[]) => {
  const times = payments.map(payment => Date.parse(payment.occurredAt))
  const existing = await db.transactions
    .where('occurredAt')
    .between(new Date(Math.min(...times) - DAY_MS).toISOString(), new Date(Math.max(...times) + DAY_MS).toISOString())
    .toArray()
  const keys = new Set(
    existing.filter(transaction => !transaction.deleted).map(transaction => `${transaction.kind}|${transaction.amount}|${toDateKey(transaction.occurredAt)}`),
  )
  return payments.map(payment => keys.has(`${payment.kind}|${signedAmount(payment)}|${toDateKey(payment.occurredAt)}`))
}

const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : '이미지를 읽지 못했어요.')

function ImportCapturePage() {
  const navigate = useNavigate()

  const categories = useCategories()
  const rules = useRules()
  const personName = usePersonName()

  const [person, setPerson] = useState<Person>(() => getSettings().defaultPerson)
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const checked = useMemo(() => candidates?.filter(candidate => candidate.isChecked) ?? [], [candidates])
  const checkedSum = checked.reduce((sum, candidate) => sum + signedAmount(candidate.payment), 0)

  const openPicker = () => fileInputRef.current?.click()

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length === 0) return

    setError(null)
    setCandidates(null)
    setProgress({ stage: '준비', ratio: 0 })
    try {
      const text = await recognizeImages(files, setProgress, { languages: ['kor', 'eng'], binarize: true })
      const payments = parseAlimtalkCapture(text).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      if (payments.length === 0) {
        setError('캡처에서 결제 알림을 찾지 못했어요. 카드사 알림톡 말풍선이 보이게 캡처해 주세요.')
        return
      }
      const duplicates = await findDuplicates(payments)
      setCandidates(
        payments.map((payment, index) => ({
          id: index,
          payment,
          category: suggestCategory(payment.merchant, rules, categories.map(item => item.name)) ?? UNCATEGORIZED,
          isChecked: !duplicates[index],
          isDuplicate: duplicates[index],
        })),
      )
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setProgress(null)
    }
  }

  const updateCandidate = (id: number, patch: Partial<Candidate>) =>
    setCandidates(previous => previous?.map(candidate => (candidate.id === id ? { ...candidate, ...patch } : candidate)) ?? null)

  const handleSave = async () => {
    if (checked.length === 0) return
    setIsSaving(true)
    for (const { payment, category } of checked) {
      await saveTransaction({
        occurredAt: payment.occurredAt,
        person,
        kind: payment.kind,
        amount: signedAmount(payment),
        shareCount: 1,
        merchant: payment.merchant,
        category,
        excluded: false,
        source: '알림',
        memo: payment.isCancel ? '결제 취소' : '',
        rawText: payment.text,
        scope: categories.find(item => item.name === category)?.personal ? '개인' : '공동',
      })
      // 여기서 고른 카테고리는 다음 캡처부터 자동으로 분류되도록 규칙으로 남긴다.
      if (payment.merchant && category !== UNCATEGORIZED && classifyMerchant(payment.merchant, rules) !== category) {
        await saveRule(payment.merchant, category)
      }
    }
    syncNow().catch(() => {})
    navigate(LIST_PATH, { replace: true })
    celebrate(`${checked.length}건을 한 번에 기록했어요`)
  }

  return (
    <div className="page">
      <TopBar showBack title="알림 캡처로 가져오기" />
      <main className="page-content form">
        <div className="import-person">
          <span className="import-person-label">누구의 결제인가요?</span>
          {IS_WEB_BUILD ? (
            <span className="person-chip">
              <PersonAvatar person={person} size={22} /> {personName(person)}
            </span>
          ) : (
            <PersonToggle value={person} onChange={setPerson} />
          )}
        </div>

        <section className="card ocr-card">
          <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
          {progress && <ImportProgress progress={progress} />}
          {!progress && error && (
            <EmptyState sticker="puzzled">
              <span>{error}</span>
              <button type="button" className="button ocr-button" onClick={openPicker}>
                다시 선택
              </button>
            </EmptyState>
          )}
          {!progress && !error && !candidates && <ImportGuide onPick={openPicker} />}
          {!progress && !error && candidates && (
            <ImportSummary count={candidates.length} duplicateCount={candidates.filter(candidate => candidate.isDuplicate).length} onRetry={openPicker} />
          )}
        </section>

        {candidates && (
          <section className="card import-list-card">
            <ul className="import-list">
              {candidates.map(candidate => (
                <ImportRow
                  key={candidate.id}
                  candidate={candidate}
                  categories={categories.filter(category => category.kind === candidate.payment.kind)}
                  onChange={patch => updateCandidate(candidate.id, patch)}
                />
              ))}
            </ul>
          </section>
        )}
      </main>

      {candidates && (
        <div className="save-bar">
          <div className="save-bar-totals">
            <span>{checked.length}건 선택</span>
            <strong>{formatWon(checkedSum)}</strong>
          </div>
          <button type="button" className="button button-primary" disabled={isSaving || checked.length === 0} onClick={handleSave}>
            {checked.length}건 저장
          </button>
        </div>
      )}
    </div>
  )
}

const GUIDE_STEPS = ['카드사 알림톡 채팅방에서 결제 알림이 보이게 캡처', '여러 날이면 여러 장 캡처 (겹쳐도 괜찮아요)', '캡처를 한꺼번에 선택하고 확인 후 저장']

function ImportGuide({ onPick }: { onPick: () => void }) {
  return (
    <>
      <div className="ocr-guide-head">
        <Sticker name="thinking" size={64} />
        <div>
          <h2 className="card-title">카톡 결제 알림 한꺼번에 기록</h2>
          <p className="card-description">캡처 속 결제 알림을 읽어서 내역으로 만들어 드려요.</p>
        </div>
      </div>
      <ol className="ocr-steps">
        {GUIDE_STEPS.map((step, index) => (
          <li key={step}>
            <span className="ocr-step-number">{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <button type="button" className="button button-primary ocr-button" onClick={onPick}>
        <CameraIcon size={20} weight="bold" aria-hidden="true" />
        캡처 선택
      </button>
      <p className="ocr-privacy">
        <LockSimpleIcon size={14} weight="bold" aria-hidden="true" />
        이미지는 폰 안에서만 읽고 어디에도 보내지 않아요
      </p>
    </>
  )
}

function ImportProgress({ progress }: { progress: OcrProgress }) {
  const percent = Math.round(progress.ratio * 100)
  return (
    <div className="ocr-progress">
      <Sticker name="thinking" size={72} />
      <div className="ocr-progress-body">
        <strong>{progress.stage === '준비' ? '글자 인식 준비 중…' : `캡처 읽는 중 ${percent}%`}</strong>
        <div className="meter meter-accent">
          <div className="meter-fill" style={{ width: `${percent}%` }} />
        </div>
        <span>처음 한 번은 인식 데이터를 받느라 조금 걸려요</span>
      </div>
    </div>
  )
}

type ImportSummaryProps = { count: number; duplicateCount: number; onRetry: () => void }

function ImportSummary({ count, duplicateCount, onRetry }: ImportSummaryProps) {
  return (
    <div className="ocr-done">
      <Sticker name="done" size={56} />
      <div className="ocr-done-text">
        <strong>결제 {count}건을 찾았어요</strong>
        <span>{duplicateCount > 0 ? `이미 있는 것 같은 ${duplicateCount}건은 빼 두었어요` : '금액·가맹점이 맞는지 확인해 주세요'}</span>
      </div>
      <button type="button" className="text-button text-primary" onClick={onRetry}>
        다시 선택
      </button>
    </div>
  )
}

type ImportRowProps = {
  candidate: Candidate
  categories: Category[]
  onChange: (patch: Partial<Candidate>) => void
}

function ImportRow({ candidate, categories, onChange }: ImportRowProps) {
  const { payment } = candidate

  return (
    <li className={`import-row${candidate.isChecked ? '' : ' is-unchecked'}`}>
      <input
        type="checkbox"
        className="import-check"
        aria-label={`${payment.merchant || '가맹점 없음'} 저장`}
        checked={candidate.isChecked}
        onChange={event => onChange({ isChecked: event.target.checked })}
      />
      <CategoryIcon name={candidate.category} size={18} />
      <div className="import-row-main">
        <strong className="tx-row-title">{payment.merchant || '가맹점 없음'}</strong>
        <span className="tx-row-meta">
          {formatShortDay(payment.occurredAt)} {formatTime(payment.occurredAt)}
          {payment.isCancel && <span className="tx-badge">취소</span>}
          {candidate.isDuplicate && <span className="tx-badge">이미 있는 듯</span>}
        </span>
        <select className="import-category" aria-label="카테고리" value={candidate.category} onChange={event => onChange({ category: event.target.value })}>
          {categories.map(category => (
            <option key={category.name} value={category.name}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <span className={`amount amount-${payment.kind}`}>{formatWon(signedAmount(payment))}</span>
    </li>
  )
}

export default ImportCapturePage
