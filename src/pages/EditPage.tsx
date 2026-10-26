import { CaretDownIcon, CaretUpIcon, ClipboardTextIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import CategoryIcon from '../components/CategoryIcon'
import ConfirmSheet from '../components/ConfirmSheet'
import FieldHint from '../components/FieldHint'
import PersonToggle from '../components/PersonToggle'
import Segmented from '../components/Segmented'
import TopBar from '../components/TopBar'
import { markCapture } from '../db/captures'
import { buildPastedDraft } from '../db/pastedDraft'
import { useCategories, usePersonName, useRecentInputs, useRules, useTransaction } from '../db/hooks'
import { celebrate } from '../celebration/store'
import { deleteTransaction, getRecordActivity, saveRule, saveTransaction, splitTransaction, type TransactionInput } from '../db/repository'
import { evaluateAmount } from '../domain/amountExpression'
import type { FrequentEntry } from '../domain/insights'
import { cheerSubline } from '../domain/celebration'
import { classifyMerchant, suggestCategory } from '../domain/classify'
import type { ParsedPayment } from '../domain/notificationParser'
import { parsePastedPayment } from '../domain/pastedPayment'
import { myShare } from '../domain/stats'
import { KINDS, SCOPES, UNCATEGORIZED, type Category, type Kind, type Transaction } from '../domain/types'
import { LIST_PATH } from '../paths'
import { getSettings } from '../sync/settings'
import { syncNow } from '../sync/sync'
import { formatDayLabel, formatShortDateTime, formatTime, formatWon, fromLocalInputValue, toLocalInputValue } from '../utils/format'
import NotFoundPage from './NotFoundPage'

const hasCustomOptions = (input: TransactionInput) => input.shareCount > 1 || input.excluded || input.memo.trim() !== ''

const describeOptions = (input: TransactionInput) => {
  const parts = [formatShortDateTime(input.occurredAt)]
  if (input.shareCount > 1) parts.push(`${input.shareCount}명이 나눠 냄`)
  if (input.excluded) parts.push('통계 제외')
  if (input.memo.trim()) parts.push('메모')
  return parts.join(' · ')
}

type EditLocationState = { draft?: TransactionInput; captureKey?: string } | null

const emptyDraft = (): TransactionInput => ({
  occurredAt: new Date().toISOString(),
  person: getSettings().defaultPerson,
  kind: '지출',
  amount: 0,
  shareCount: 1,
  merchant: '',
  category: '',
  excluded: false,
  source: '수동',
  memo: '',
  rawText: '',
  scope: '공동',
})

function EditPage() {
  const { id } = useParams()
  const location = useLocation()

  const sharedText = new URLSearchParams(location.search).get('text')
  const transaction = useTransaction(id)
  const sharedDraft = useLiveQuery(async () => (sharedText ? buildPastedDraft(sharedText, emptyDraft()) : null), [sharedText])

  if (!id) {
    if (sharedText && sharedDraft === undefined) return null
    const state = location.state as EditLocationState
    return <TransactionForm initial={sharedDraft ?? state?.draft ?? emptyDraft()} captureKey={state?.captureKey} />
  }
  if (transaction === undefined) return null
  if (transaction === null) return <NotFoundPage />
  return <TransactionForm initial={transaction} transaction={transaction} />
}

type TransactionFormProps = {
  initial: TransactionInput
  transaction?: Transaction
  captureKey?: string
}

function TransactionForm({ initial, transaction, captureKey }: TransactionFormProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const categories = useCategories()
  const rules = useRules()
  const recent = useRecentInputs(initial.kind)
  const personName = usePersonName()

  const [draft, setDraft] = useState(initial)
  const [amountText, setAmountText] = useState(initial.amount ? String(initial.amount) : '')
  const [shouldSaveRule, setShouldSaveRule] = useState(true)
  const [sheet, setSheet] = useState<'delete' | 'split' | 'paste' | null>(null)

  const amount = evaluateAmount(amountText)
  const kindCategories = useMemo(() => categories.filter(category => category.kind === draft.kind), [categories, draft.kind])
  const existingRuleCategory = classifyMerchant(draft.merchant, rules)
  const categoryNames = categories.map(category => category.name)
  const canOfferRule = draft.merchant.trim() !== '' && draft.category !== '' && draft.category !== UNCATEGORIZED
  const canSave = amount !== null && amount !== 0 && draft.category !== ''

  const update = (patch: Partial<TransactionInput>) => setDraft(previous => ({ ...previous, ...patch }))

  // 단축어로 이 화면부터 열렸으면 돌아갈 화면이 없으므로 목록으로 간다.
  const goBack = () => (location.key === 'default' ? navigate(LIST_PATH, { replace: true }) : navigate(-1))

  const defaultScopeOf = (categoryName: string) =>
    categories.find(category => category.name === categoryName)?.personal ? '개인' : '공동'

  const handleCategoryChange = (category: string) => update({ category, scope: defaultScopeOf(category) })

  const handleKindChange = (kind: Kind) => {
    const keepsCategory = categories.some(category => category.kind === kind && category.name === draft.category)
    update({ kind, category: keepsCategory ? draft.category : '' })
  }

  const handleMerchantChange = (merchant: string) => {
    update({ merchant })
    if (!recent.merchants.includes(merchant)) return
    const matched = suggestCategory(merchant, rules, categoryNames)
    if (matched && (!draft.category || draft.category === UNCATEGORIZED)) handleCategoryChange(matched)
  }

  const handleMerchantBlur = () => {
    if (draft.category && draft.category !== UNCATEGORIZED) return
    const matched = suggestCategory(draft.merchant, rules, categoryNames)
    if (matched) handleCategoryChange(matched)
  }

  const handleFrequentPick = (entry: FrequentEntry) => {
    setAmountText(String(entry.amount))
    update({ merchant: entry.merchant, category: entry.category, scope: entry.scope })
  }

  const handlePasteApply = (text: string, parsed: ParsedPayment) => {
    const matched = suggestCategory(parsed.merchant, rules, categoryNames)
    const keepsCategory = categories.some(category => category.kind === parsed.kind && category.name === draft.category)
    setAmountText(String(parsed.isCancel ? -parsed.amount : parsed.amount))
    update({
      kind: parsed.kind,
      merchant: parsed.merchant || draft.merchant,
      occurredAt: parsed.occurredAt,
      category: matched ?? (keepsCategory ? draft.category : ''),
      scope: defaultScopeOf(matched ?? (keepsCategory ? draft.category : '')),
      source: '붙여넣기',
      memo: parsed.isCancel ? '결제 취소' : draft.memo,
      rawText: text.trim(),
    })
    setSheet(null)
  }

  const handleSave = async () => {
    if (!canSave) return
    const saved = await saveTransaction({ ...draft, amount: amount!, merchant: draft.merchant.trim() }, transaction?.id)
    if (canOfferRule && shouldSaveRule && existingRuleCategory !== draft.category) {
      await saveRule(draft.merchant, draft.category)
    }
    if (captureKey) await markCapture(captureKey, '기록됨', saved)
    syncNow().catch(() => {})
    goBack()
    if (!transaction) celebrate(cheerSubline(await getRecordActivity(draft.person)))
  }

  const handleDelete = async () => {
    if (!transaction) return
    await deleteTransaction(transaction.id)
    syncNow().catch(() => {})
    goBack()
  }

  const handleSplit = async (splitAmount: number, category: string) => {
    if (!transaction) return
    await splitTransaction({ ...transaction, ...draft, amount: amount ?? transaction.amount }, splitAmount, category)
    syncNow().catch(() => {})
    goBack()
  }

  return (
    <div className="page">
      <TopBar
        showBack
        onBack={goBack}
        title={transaction ? '내역 수정' : '내역 추가'}
        actions={
          !transaction &&
          !captureKey && (
            <button type="button" className="text-button text-primary top-bar-action" onClick={() => setSheet('paste')}>
              <ClipboardTextIcon size={18} weight="bold" aria-hidden="true" />
              알림 붙여넣기
            </button>
          )
        }
      />

      <main className="page-content form edit-form">
        {!transaction && !captureKey && recent.frequent.length > 0 && (
          <FrequentEntries entries={recent.frequent} onPick={handleFrequentPick} />
        )}

        <section className="card form-section">
          <Segmented label="구분" options={KINDS} value={draft.kind} onChange={handleKindChange} />
          <label className="field">
            <span className="field-label">금액</span>
            <input
              className="amount-hero-input"
              inputMode="text"
              placeholder="0"
              value={amountText}
              onChange={event => setAmountText(event.target.value)}
              autoFocus={!transaction && !captureKey}
            />
            <AmountHint text={amountText} amount={amount} shareCount={draft.shareCount} />
          </label>
        </section>

        <section className="card form-section">
          <div className="field">
            <span className="field-label">누가</span>
            <PersonToggle value={draft.person} onChange={person => update({ person })} />
          </div>
          {draft.kind === '지출' && (
            <div className="field">
              <span className="field-label">공동·개인</span>
              <Segmented label="공동·개인" options={SCOPES} value={draft.scope} onChange={scope => update({ scope })} />
              <FieldHint>{draft.scope === '공동' ? '둘이 함께 쓴 지출이에요' : `${personName(draft.person)}의 개인 지출로 잡혀요`}</FieldHint>
            </div>
          )}
        </section>

        <section className="card form-section">
          <label className="field">
            <span className="field-label">가맹점·내용</span>
            <input
              className="field-input"
              placeholder="예: 스타벅스"
              list="merchant-suggestions"
              value={draft.merchant}
              onChange={event => handleMerchantChange(event.target.value)}
              onBlur={handleMerchantBlur}
            />
            <datalist id="merchant-suggestions">
              {recent.merchants.map(merchant => (
                <option key={merchant} value={merchant} />
              ))}
            </datalist>
          </label>

          <div className="field">
            <span className="field-label">카테고리</span>
            <CategoryGrid categories={kindCategories} recent={recent.categories} value={draft.category} onChange={handleCategoryChange} />
            {canOfferRule && existingRuleCategory !== draft.category && (
              <label className="checkbox">
                <input type="checkbox" checked={shouldSaveRule} onChange={event => setShouldSaveRule(event.target.checked)} />
                앞으로 "{draft.merchant.trim()}"은(는) {draft.category}(으)로 분류
              </label>
            )}
          </div>
        </section>

        <details className="more-options" open={hasCustomOptions(initial)}>
          <summary>
            더 보기
            <span className="more-options-summary">{describeOptions(draft)}</span>
            <CaretDownIcon className="more-options-caret" size={16} weight="bold" aria-hidden="true" />
          </summary>
          <div className="more-options-body">
            <div className="field">
              <span className="field-label">나눠 낸 인원</span>
              <div className="stepper">
                <button
                  type="button"
                  className="stepper-button"
                  aria-label="인원 줄이기"
                  disabled={draft.shareCount <= 1}
                  onClick={() => update({ shareCount: draft.shareCount - 1 })}
                >
                  −
                </button>
                <span className="stepper-value">{draft.shareCount === 1 ? '혼자' : `${draft.shareCount}명`}</span>
                <button type="button" className="stepper-button" aria-label="인원 늘리기" onClick={() => update({ shareCount: draft.shareCount + 1 })}>
                  +
                </button>
              </div>
            </div>

            <label className="field">
              <span className="field-label">날짜·시간</span>
              <input
                className="field-input"
                type="datetime-local"
                value={toLocalInputValue(draft.occurredAt)}
                onChange={event => event.target.value && update({ occurredAt: fromLocalInputValue(event.target.value) })}
              />
            </label>

            <label className="checkbox">
              <input type="checkbox" checked={draft.excluded} onChange={event => update({ excluded: event.target.checked })} />
              통계에서 제외 (대신 결제해 준 돈 등)
            </label>

            <label className="field">
              <span className="field-label">메모</span>
              <input className="field-input" value={draft.memo} onChange={event => update({ memo: event.target.value })} />
            </label>

            {draft.rawText && (
              <details className="raw-text">
                <summary>원본 알림</summary>
                <pre>{draft.rawText}</pre>
              </details>
            )}
          </div>
        </details>

        {transaction && (
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setSheet('split')}>
              다른 카테고리로 나누기
            </button>
            <button type="button" className="button button-danger-outline" onClick={() => setSheet('delete')}>
              삭제
            </button>
          </div>
        )}
      </main>

      <div className="save-bar">
        <div className="save-bar-totals">
          <span>
            {draft.kind}
            {draft.category && ` · ${draft.category}`}
          </span>
          {amount === null || amount === 0 ? (
            <span className="save-bar-placeholder">금액을 입력해 주세요</span>
          ) : (
            <strong className={draft.kind === '지출' ? 'amount-지출' : 'amount-수입'}>{formatWon(myShare({ amount, shareCount: draft.shareCount }))}</strong>
          )}
        </div>
        <button type="button" className="button button-primary" disabled={!canSave} onClick={handleSave}>
          저장
        </button>
      </div>

      {sheet === 'delete' && (
        <ConfirmSheet message="이 내역을 삭제할까요?" confirmLabel="삭제" onConfirm={handleDelete} onCancel={() => setSheet(null)} />
      )}
      {sheet === 'paste' && <PasteSheet onApply={handlePasteApply} onCancel={() => setSheet(null)} />}
      {sheet === 'split' && (
        <SplitSheet total={amount ?? draft.amount} categories={kindCategories} onSplit={handleSplit} onCancel={() => setSheet(null)} />
      )}
    </div>
  )
}

type FrequentEntriesProps = {
  entries: FrequentEntry[]
  onPick: (entry: FrequentEntry) => void
}

function FrequentEntries({ entries, onPick }: FrequentEntriesProps) {
  return (
    <section className="frequent" aria-label="자주 쓰는 내역">
      <span className="frequent-title">자주 쓰는 내역</span>
      <div className="frequent-list">
        {entries.map(entry => (
          <button key={entry.merchant} type="button" className="frequent-chip" onClick={() => onPick(entry)}>
            <CategoryIcon name={entry.category} size={14} />
            <span className="frequent-chip-text">
              <strong>{entry.merchant}</strong>
              <span>{formatWon(entry.amount)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

type PasteSheetProps = {
  onApply: (text: string, parsed: ParsedPayment) => void
  onCancel: () => void
}

function PasteSheet({ onApply, onCancel }: PasteSheetProps) {
  const [text, setText] = useState('')

  const parsed = useMemo(() => (text.trim() ? parsePastedPayment(text) : null), [text])

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" role="dialog" aria-label="카톡 알림 붙여넣기" onClick={event => event.stopPropagation()}>
        <p className="sheet-message">카드사 알림 메시지를 길게 눌러 복사한 뒤 붙여넣어 주세요.</p>
        <textarea
          className="field-input paste-input"
          rows={6}
          placeholder="여기에 붙여넣기"
          value={text}
          onChange={event => setText(event.target.value)}
          autoFocus
        />
        {text.trim() && <PastePreview parsed={parsed} />}
        <div className="sheet-actions">
          <button type="button" className="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="button button-primary" disabled={!parsed} onClick={() => onApply(text, parsed!)}>
            입력하기
          </button>
        </div>
      </div>
    </div>
  )
}

function PastePreview({ parsed }: { parsed: ParsedPayment | null }) {
  if (!parsed) return <FieldHint tone="error">금액이나 결제·입금 여부를 찾지 못했어요. 직접 입력해 주세요.</FieldHint>
  return (
    <FieldHint tone="result">
      {parsed.isCancel ? '취소 ' : ''}
      {parsed.kind} {formatWon(parsed.amount)}
      {parsed.merchant && ` · ${parsed.merchant}`} · {formatDayLabel(parsed.occurredAt)} {formatTime(parsed.occurredAt)}
    </FieldHint>
  )
}

type AmountHintProps = { text: string; amount: number | null; shareCount: number }

function AmountHint({ text, amount, shareCount }: AmountHintProps) {
  if (text.trim() === '') return null
  if (amount === null) return <FieldHint tone="error">계산할 수 없는 식이에요</FieldHint>

  const isExpression = /[+\-*/()]/.test(text.replace(/^-/, ''))
  const parts = []
  if (isExpression) parts.push(`= ${formatWon(amount)}`)
  if (shareCount > 1) parts.push(`내 몫 ${formatWon(myShare({ amount, shareCount }))}`)
  if (parts.length === 0) return null
  return <FieldHint tone="result">{parts.join(' · ')}</FieldHint>
}

const COLLAPSED_COUNT = 8

const orderByRecent = (categories: Category[], recent: string[]) => {
  const recentSet = new Set(recent.slice(0, 4))
  return [...recent.slice(0, 4).flatMap(name => categories.filter(category => category.name === name)), ...categories.filter(category => !recentSet.has(category.name))]
}

type CategoryGridProps = {
  categories: Category[]
  recent?: string[]
  value: string
  onChange: (category: string) => void
}

function CategoryGrid({ categories, recent = [], value, onChange }: CategoryGridProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const ordered = orderByRecent(categories, recent)
  const visible = isExpanded ? ordered : ordered.slice(0, COLLAPSED_COUNT)
  const hiddenSelected = !isExpanded && value && !visible.some(category => category.name === value)
  const shown = hiddenSelected ? [...visible.slice(0, COLLAPSED_COUNT - 1), ...ordered.filter(category => category.name === value)] : visible

  return (
    <>
      <div className="category-grid" role="radiogroup" aria-label="카테고리">
        {shown.map(category => (
          <button
            key={category.name}
            type="button"
            role="radio"
            aria-checked={category.name === value}
            className="category-cell"
            onClick={() => onChange(category.name)}
          >
            <CategoryIcon name={category.name} emoji={category.icon} size={20} />
            <span className="category-cell-name">{category.name}</span>
          </button>
        ))}
      </div>
      {ordered.length > COLLAPSED_COUNT && (
        <button type="button" className="text-button category-more" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? '접기' : `전체 ${ordered.length}개 보기`}
          {isExpanded ? <CaretUpIcon size={14} weight="bold" aria-hidden="true" /> : <CaretDownIcon size={14} weight="bold" aria-hidden="true" />}
        </button>
      )}
    </>
  )
}

type SplitSheetProps = {
  total: number
  categories: Category[]
  onSplit: (amount: number, category: string) => void
  onCancel: () => void
}

function SplitSheet({ total, categories, onSplit, onCancel }: SplitSheetProps) {
  const [amountText, setAmountText] = useState('')
  const [category, setCategory] = useState('')

  const amount = evaluateAmount(amountText)
  const isValid = amount !== null && amount > 0 && amount < total && category !== ''

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" role="dialog" aria-label="다른 카테고리로 나누기" onClick={event => event.stopPropagation()}>
        <p className="sheet-message">
          {formatWon(total)} 중 일부를 다른 카테고리로 떼어내요.
          {amount !== null && amount > 0 && amount < total && ` 남는 금액 ${formatWon(total - amount)}`}
        </p>
        <input
          className="field-input"
          placeholder="떼어낼 금액"
          value={amountText}
          onChange={event => setAmountText(event.target.value)}
          autoFocus
        />
        <CategoryGrid categories={categories} value={category} onChange={setCategory} />
        <div className="sheet-actions">
          <button type="button" className="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="button button-primary" disabled={!isValid} onClick={() => onSplit(amount!, category)}>
            나누기
          </button>
        </div>
      </div>
    </div>
  )
}

export default EditPage
