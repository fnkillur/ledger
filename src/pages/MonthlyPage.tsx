import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router'
import PersonAvatar from '../components/PersonAvatar'
import Segmented from '../components/Segmented'
import Sticker from '../components/Sticker'
import TopBar from '../components/TopBar'
import { db } from '../db/database'
import { useCategories } from '../db/hooks'
import { saveMonthlyTotals } from '../db/repository'
import { evaluateAmount } from '../domain/amountExpression'
import { parseMonthlySummary, type OthersCheck } from '../domain/monthlySummary'
import { KINDS, PEOPLE, type Category, type Kind, type Person } from '../domain/types'
import { recognizeImages, type OcrProgress } from '../ocr/recognize'
import { IS_WEB_BUILD } from '../platform'
import { getSettings } from '../sync/settings'
import { syncNow } from '../sync/sync'
import { currentMonthKey, formatWon } from '../utils/format'

type OcrResult = { unmatched: { line: string; amount: number }[]; total: number | null; filled: number; othersCheck: OthersCheck | null }

const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : '이미지를 읽지 못했어요.')

const sumAmounts = (texts: Record<string, string>, categories: Category[], kind: Kind) =>
  categories
    .filter(category => category.kind === kind)
    .reduce((sum, category) => sum + (evaluateAmount(texts[category.name] ?? '') ?? 0), 0)

function MonthlyPage() {
  const navigate = useNavigate()

  const categories = useCategories()

  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [person, setPerson] = useState<Person>(getSettings().defaultPerson)

  const existing = useLiveQuery(
    () => db.transactions.where('id').startsWith(`monthly-${monthKey}-${person}-`).filter(row => !row.deleted).toArray(),
    [monthKey, person],
  )

  return (
    <div className="page">
      <TopBar showBack title="월 합계 입력" />
      <main className="page-content form">
        <div className="monthly-target">
          <label className="field">
            <span className="field-label">월</span>
            <input className="field-input" type="month" min="2025-01" max={currentMonthKey()} value={monthKey} onChange={event => event.target.value && setMonthKey(event.target.value)} />
          </label>
          {IS_WEB_BUILD ? (
            <div className="field">
              <span className="field-label">누구</span>
              <span className="monthly-person">
                <PersonAvatar person={person} size={22} /> {person}
              </span>
            </div>
          ) : (
            <div className="field">
              <span className="field-label">누구</span>
              <Segmented label="누구" options={PEOPLE} value={person} onChange={setPerson} />
            </div>
          )}
        </div>

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const invalidCategories = useMemo(
    () => Object.entries(texts).filter(([, text]) => text.trim() !== '' && evaluateAmount(text) === null).map(([name]) => name),
    [texts],
  )
  const expenseSum = sumAmounts(texts, categories, '지출')

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length === 0) return

    setError(null)
    setOcrResult(null)
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
      setTexts(previous => ({ ...previous, ...Object.fromEntries(parsed.items.map(item => [item.category, String(item.amount)])) }))
      setOcrResult({ unmatched: parsed.unmatched, total: parsed.total, filled: parsed.items.length, othersCheck: parsed.othersCheck })
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setProgress(null)
    }
  }

  const handleSave = async () => {
    if (invalidCategories.length > 0) return
    setIsSaving(true)
    await onSave(categories.map(category => ({ category: category.name, amount: evaluateAmount(texts[category.name] ?? '') ?? 0 })))
  }

  return (
    <>
      <section className="card">
        <button type="button" className="button button-primary ocr-button" disabled={progress !== null} onClick={() => fileInputRef.current?.click()}>
          📷 토스 소비 분석 캡처로 채우기
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
        <p className="card-description">
          캡처 여러 장을 한 번에 골라도 돼요. 이미지는 폰 안에서만 읽고 어디에도 보내지 않아요. 처음 한 번은 글자 인식 데이터를 받느라 조금 걸려요.
        </p>
        {progress && <OcrProgressBar progress={progress} />}
        {error && <OcrFailure message={error} />}
        {ocrResult && <OcrSummary result={ocrResult} expenseSum={expenseSum} />}
      </section>

      {KINDS.map(kind => (
        <section key={kind} className="card">
          <h2 className="card-title">
            {kind}
            <span className="count"> {formatWon(sumAmounts(texts, categories, kind))}</span>
          </h2>
          <ul className="monthly-list">
            {categories
              .filter(category => category.kind === kind)
              .map(category => (
                <li key={category.name} className="monthly-row">
                  <span className="monthly-label">
                    {category.icon} {category.name}
                  </span>
                  <input
                    className={`field-input monthly-input${invalidCategories.includes(category.name) ? ' is-invalid' : ''}`}
                    inputMode="text"
                    placeholder="0"
                    value={texts[category.name] ?? ''}
                    onChange={event => setTexts(previous => ({ ...previous, [category.name]: event.target.value }))}
                  />
                </li>
              ))}
          </ul>
        </section>
      ))}

      <button type="button" className="button button-primary" disabled={isSaving || invalidCategories.length > 0} onClick={handleSave}>
        저장
      </button>
    </>
  )
}

function OcrProgressBar({ progress }: { progress: OcrProgress }) {
  const percent = Math.round(progress.ratio * 100)
  return (
    <div className="ocr-progress">
      <Sticker name="thinking" size={88} />
      <div className="ocr-progress-body">
        <div className="meter meter-accent">
          <div className="meter-fill" style={{ width: `${percent}%` }} />
        </div>
        <span>{progress.stage === '준비' ? '글자 인식 준비 중…' : `글자 읽는 중 ${percent}%`}</span>
      </div>
    </div>
  )
}

function OthersCheckNote({ check }: { check: OthersCheck }) {
  if (check.expected !== check.actual) {
    return (
      <p className="meter-note text-warning">
        ⚠️ "그 외 {check.count}개" 합계 {formatWon(check.expected)} · 읽은 {check.readCount}개 합계 {formatWon(check.actual)}
      </p>
    )
  }
  return (
    <p className="meter-note">
      ✅ "그 외 {check.count}개" 합계 {formatWon(check.expected)}과 읽은 금액 합계가 정확히 같아요
      {check.readCount < check.count && ` (0원이거나 앱에 없는 카테고리 ${check.count - check.readCount}개 제외)`}
    </p>
  )
}

function OcrFailure({ message }: { message: string }) {
  return (
    <div className="ocr-done">
      <Sticker name="puzzled" size={56} />
      <p className="status status-error">{message}</p>
    </div>
  )
}

function OcrSummary({ result, expenseSum }: { result: OcrResult; expenseSum: number }) {
  const isTotalMatched = result.total !== null && result.total === expenseSum

  return (
    <div className="ocr-summary">
      <div className="ocr-done">
        <Sticker name="done" size={56} />
        <p className="status status-success">카테고리 {result.filled}개를 채웠어요. 숫자가 맞는지 확인해 주세요.</p>
      </div>
      {result.total !== null && (
        <p className={`meter-note${isTotalMatched ? '' : ' text-warning'}`}>
          {isTotalMatched ? '✅' : '⚠️'} 캡처 총액 {formatWon(result.total)} · 입력한 지출 합계 {formatWon(expenseSum)}
        </p>
      )}
      {result.othersCheck && <OthersCheckNote check={result.othersCheck} />}
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
