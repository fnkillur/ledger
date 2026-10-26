import { CameraIcon, CheckCircleIcon, LockSimpleIcon, MinusCircleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import CategoryIcon from '../components/CategoryIcon'
import PersonAvatar from '../components/PersonAvatar'
import PersonToggle from '../components/PersonToggle'
import Sticker from '../components/Sticker'
import TopBar from '../components/TopBar'
import { db } from '../db/database'
import { useCategories, usePersonName } from '../db/hooks'
import { saveMonthlyTotals } from '../db/repository'
import { evaluateAmount } from '../domain/amountExpression'
import { parseMonthlySummary, type OthersCheck } from '../domain/monthlySummary'
import { isAggregate, KINDS, type Category, type Kind, type Person } from '../domain/types'
import { recognizeImages, type OcrProgress } from '../ocr/recognize'
import { IS_WEB_BUILD } from '../platform'
import { getSettings } from '../sync/settings'
import { syncNow } from '../sync/sync'
import { EARLIEST_MONTH_KEY, toRange } from '../domain/period'
import { currentMonthKey, formatWon, shiftMonth } from '../utils/format'

type OcrResult = {
  unmatched: { line: string; amount: number }[]
  skipped: { category: string; amount: number }[]
  total: number | null
  filled: number
  othersCheck: OthersCheck | null
}

// 입력 표에 보이는 카테고리만 채운다. 저축처럼 통계에서 빼는 카테고리는 따로 알려준다.
const isInputCategory = (category: Category) => KINDS.includes(category.kind) && !category.excluded

const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : '이미지를 읽지 못했어요.')

// 월 합계는 보통 달이 끝난 뒤 입력하므로, 월초에는 지난달을 기본으로 고른다.
const defaultMonthKey = () => {
  const today = new Date()
  if (today.getDate() > 10) return currentMonthKey()
  return shiftMonth(currentMonthKey(), -1) < EARLIEST_MONTH_KEY ? EARLIEST_MONTH_KEY : shiftMonth(currentMonthKey(), -1)
}

const sumAmounts = (texts: Record<string, string>, categories: Category[], kind: Kind) =>
  categories
    .filter(category => category.kind === kind && isInputCategory(category))
    .reduce((sum, category) => sum + (evaluateAmount(texts[category.name] ?? '') ?? 0), 0)

function MonthlyPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const categories = useCategories()
  const personName = usePersonName()

  const [monthKey, setMonthKey] = useState(() => (location.state as { monthKey?: string } | null)?.monthKey ?? defaultMonthKey())
  const [person, setPerson] = useState<Person>(getSettings().defaultPerson)

  const existing = useLiveQuery(
    () => db.transactions.where('id').startsWith(`monthly-${monthKey}-${person}-`).filter(row => !row.deleted).toArray(),
    [monthKey, person],
  )
  const detailedCount = useLiveQuery(() => {
    const { start, end } = toRange({ type: '월별', monthKey })
    return db.transactions
      .where('occurredAt')
      .between(start, end)
      .filter(row => !row.deleted && row.person === person && !isAggregate(row.source))
      .count()
  }, [monthKey, person])

  return (
    <div className="page">
      <TopBar showBack title="월 합계 입력" />
      <main className="page-content form">
        <div className="monthly-target">
          <input
            className="field-input monthly-month-input"
            type="month"
            aria-label="월"
            min={EARLIEST_MONTH_KEY}
            max={currentMonthKey()}
            value={monthKey}
            onChange={event => event.target.value && setMonthKey(event.target.value)}
          />
          {IS_WEB_BUILD ? (
            <span className="person-chip">
              <PersonAvatar person={person} size={22} /> {personName(person)}
            </span>
          ) : (
            <PersonToggle value={person} onChange={setPerson} />
          )}
        </div>

        {(detailedCount ?? 0) > 0 && (
          <p className="status status-warning icon-note">
            <WarningCircleIcon size={16} weight="bold" aria-hidden="true" />
            이 달에는 {personName(person)}의 건별 기록이 {detailedCount}건 있어요. 월 합계까지 저장하면 통계에 두 번 더해져요.
          </p>
        )}

        {existing !== undefined && categories.length > 0 && (
          <MonthlyForm
            key={`${monthKey}-${person}`}
            categories={categories}
            initial={Object.fromEntries(existing.map(row => [row.category, String(row.amount)]))}
            onSave={async amounts => {
              await saveMonthlyTotals(monthKey, person, amounts, categories)
              syncNow().catch(() => {})
              if (window.history.length > 1) navigate(-1)
              else navigate('/', { replace: true })
            }}
          />
        )}
      </main>
    </div>
  )
}

type MonthlyFormProps = {
  categories: Category[]
  initial: Record<string, string>
  onSave: (amounts: { category: string; amount: number }[]) => Promise<void>
}

function MonthlyForm({ categories, initial, onSave }: MonthlyFormProps) {
  const [texts, setTexts] = useState<Record<string, string>>(initial)
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [filledByOcr, setFilledByOcr] = useState<Set<string>>(new Set())
  const [previews, setPreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews])

  const invalidCategories = useMemo(
    () => Object.entries(texts).filter(([, text]) => text.trim() !== '' && evaluateAmount(text) === null).map(([name]) => name),
    [texts],
  )
  const expenseSum = sumAmounts(texts, categories, '지출')
  const incomeSum = sumAmounts(texts, categories, '수입')

  const openPicker = () => fileInputRef.current?.click()

  const handleChange = (category: string, value: string) => {
    setTexts(previous => ({ ...previous, [category]: value }))
    setFilledByOcr(previous => {
      if (!previous.has(category)) return previous
      const next = new Set(previous)
      next.delete(category)
      return next
    })
  }

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length === 0) return

    setError(null)
    setOcrResult(null)
    setPreviews(files.map(file => URL.createObjectURL(file)))
    setProgress({ stage: '준비', ratio: 0 })
    try {
      const text = await recognizeImages(files, setProgress)
      const parsed = parseMonthlySummary(
        text,
        categories.map(category => category.name),
      )
      if (parsed.items.length === 0) {
        setError('캡처에서 카테고리를 찾지 못했어요. 토스 소비 분석의 카테고리 목록이 보이게 캡처해 주세요.')
        return
      }
      const inputNames = new Set(categories.filter(isInputCategory).map(category => category.name))
      const filled = parsed.items.filter(item => inputNames.has(item.category))
      const skipped = parsed.items.filter(item => !inputNames.has(item.category))
      setTexts(previous => ({ ...previous, ...Object.fromEntries(filled.map(item => [item.category, String(item.amount)])) }))
      setFilledByOcr(new Set(filled.map(item => item.category)))
      setOcrResult({ unmatched: parsed.unmatched, skipped, total: parsed.total, filled: filled.length, othersCheck: parsed.othersCheck })
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setProgress(null)
    }
  }

  const handleSave = async () => {
    if (invalidCategories.length > 0) return
    setIsSaving(true)
    await onSave(categories.filter(isInputCategory).map(category => ({ category: category.name, amount: evaluateAmount(texts[category.name] ?? '') ?? 0 })))
  }

  return (
    <>
      <section className="card ocr-card">
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
        {progress && <OcrProgressBar progress={progress} previews={previews} />}
        {!progress && error && <OcrFailure message={error} onRetry={openPicker} />}
        {!progress && !error && ocrResult && <OcrSummary result={ocrResult} expenseSum={expenseSum} previews={previews} onRetry={openPicker} />}
        {!progress && !error && !ocrResult && <OcrGuide onPick={openPicker} />}
      </section>

      {KINDS.map(kind => (
        <section key={kind} className="card">
          <h2 className="card-title">
            {kind}
            <span className="count"> {formatWon(sumAmounts(texts, categories, kind))}</span>
          </h2>
          {kind === '지출' && filledByOcr.size > 0 && <p className="card-description">파란 칸은 캡처에서 채운 값이에요. 고치면 표시가 사라져요.</p>}
          <ul className="monthly-list">
            {categories
              .filter(category => category.kind === kind && isInputCategory(category))
              .map(category => (
                <li key={category.name} className="monthly-row">
                  <span className="monthly-label">
                    <CategoryIcon name={category.name} emoji={category.icon} size={14} />
                    <span className="label-text">{category.name}</span>
                  </span>
                  <input
                    className={`field-input monthly-input${invalidCategories.includes(category.name) ? ' is-invalid' : ''}${filledByOcr.has(category.name) ? ' is-filled' : ''}`}
                    inputMode="text"
                    placeholder="0"
                    aria-label={`${category.name} 금액`}
                    value={texts[category.name] ?? ''}
                    onChange={event => handleChange(category.name, event.target.value)}
                  />
                </li>
              ))}
          </ul>
        </section>
      ))}

      <div className="save-bar">
        <div className="save-bar-totals">
          <span>
            지출 <strong className="amount-지출">{formatWon(expenseSum)}</strong>
          </span>
          <span>
            수입 <strong className="amount-수입">{formatWon(incomeSum)}</strong>
          </span>
        </div>
        <button type="button" className="button button-primary" disabled={isSaving || invalidCategories.length > 0} onClick={handleSave}>
          저장
        </button>
      </div>
    </>
  )
}

const GUIDE_STEPS = ['토스 → 소비 분석에서 이 달 화면 캡처', '"그 외 N개"를 눌러 나온 목록도 캡처', '두 장을 함께 선택']

function OcrGuide({ onPick }: { onPick: () => void }) {
  return (
    <>
      <div className="ocr-guide-head">
        <Sticker name="thinking" size={64} />
        <div>
          <h2 className="card-title">토스 캡처로 한 번에 채우기</h2>
          <p className="card-description">카테고리별 금액을 읽어서 아래 표를 채워드려요.</p>
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
        이미지는 폰 안에서만 읽고 어디에도 보내지 않아요</p>
    </>
  )
}

function Thumbnails({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null
  return (
    <div className="ocr-thumbs">
      {urls.map((url, index) => (
        <img key={url} src={url} alt={`선택한 캡처 ${index + 1}`} className="ocr-thumb" />
      ))}
    </div>
  )
}

function OcrProgressBar({ progress, previews }: { progress: OcrProgress; previews: string[] }) {
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
        <Thumbnails urls={previews} />
      </div>
    </div>
  )
}

function OthersCheckNote({ check }: { check: OthersCheck }) {
  if (check.expected !== check.actual) {
    return (
      <p className="meter-note icon-note text-warning">
        <WarningCircleIcon size={16} weight="bold" aria-hidden="true" />"그 외 {check.count}개" 합계 {formatWon(check.expected)} · 읽은 {check.readCount}개 합계 {formatWon(check.actual)}
      </p>
    )
  }
  return (
    <p className="meter-note icon-note text-success">
      <CheckCircleIcon size={16} weight="bold" aria-hidden="true" />"그 외 {check.count}개" 합계 {formatWon(check.expected)}과 읽은 금액 합계가 정확히 같아요
      {check.readCount < check.count && ` (0원이거나 앱에 없는 카테고리 ${check.count - check.readCount}개 제외)`}
    </p>
  )
}

function OcrFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <>
      <div className="ocr-done">
        <Sticker name="puzzled" size={56} />
        <p className="status status-error">{message}</p>
      </div>
      <button type="button" className="button ocr-button" onClick={onRetry}>
        다시 선택
      </button>
    </>
  )
}

type OcrSummaryProps = { result: OcrResult; expenseSum: number; previews: string[]; onRetry: () => void }

function OcrSummary({ result, expenseSum, previews, onRetry }: OcrSummaryProps) {
  const isTotalMatched = result.total !== null && result.total === expenseSum

  return (
    <div className="ocr-summary">
      <div className="ocr-done">
        <Sticker name="done" size={56} />
        <div className="ocr-done-text">
          <strong>카테고리 {result.filled}개를 채웠어요</strong>
          <span>파란 칸의 숫자가 맞는지 확인해 주세요</span>
        </div>
        <button type="button" className="text-button text-primary" onClick={onRetry}>
          다시 선택
        </button>
      </div>
      <Thumbnails urls={previews} />
      {result.total !== null && (
        <p className={`meter-note icon-note ${isTotalMatched ? 'text-success' : 'text-warning'}`}>
          {isTotalMatched ? (
            <CheckCircleIcon size={16} weight="bold" aria-hidden="true" />
          ) : (
            <WarningCircleIcon size={16} weight="bold" aria-hidden="true" />
          )}
          캡처 총액 {formatWon(result.total)} · 입력한 지출 합계 {formatWon(expenseSum)}
        </p>
      )}
      {result.othersCheck && <OthersCheckNote check={result.othersCheck} />}
      {result.skipped.length > 0 && (
        <p className="meter-note icon-note">
          <MinusCircleIcon size={16} weight="bold" aria-hidden="true" />
          통계에서 빼는 항목은 넣지 않았어요: {result.skipped.map(item => `${item.category} ${formatWon(item.amount)}`).join(', ')}
        </p>
      )}
      {result.unmatched.length > 0 && (
        <details className="raw-text">
          <summary>카테고리를 못 찾은 금액 {result.unmatched.length}개</summary>
          <ul className="unmatched-list">
            {result.unmatched.map(item => (
              <li key={item.line}>
                {item.line} → {formatWon(item.amount)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export default MonthlyPage
