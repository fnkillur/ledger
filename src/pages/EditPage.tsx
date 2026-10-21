import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import ConfirmSheet from '../components/ConfirmSheet'
import PersonAvatar from '../components/PersonAvatar'
import Segmented from '../components/Segmented'
import TopBar from '../components/TopBar'
import { markCapture } from '../db/captures'
import { useCategories, useRules, useTransaction } from '../db/hooks'
import { deleteTransaction, saveRule, saveTransaction, splitTransaction, type TransactionInput } from '../db/repository'
import { evaluateAmount } from '../domain/amountExpression'
import { classifyMerchant } from '../domain/classify'
import type { ParsedPayment } from '../domain/notificationParser'
import { parsePastedPayment } from '../domain/pastedPayment'
import { myShare } from '../domain/stats'
import { KINDS, PEOPLE, SCOPES, UNCATEGORIZED, type Category, type Kind, type Transaction } from '../domain/types'
import { getSettings } from '../sync/settings'
import { syncNow } from '../sync/sync'
import { formatDayLabel, formatTime, formatWon, fromLocalInputValue, toLocalInputValue } from '../utils/format'
import NotFoundPage from './NotFoundPage'

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

  const transaction = useTransaction(id)

  if (!id) {
    const state = location.state as EditLocationState
    return <TransactionForm initial={state?.draft ?? emptyDraft()} captureKey={state?.captureKey} />
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

  const categories = useCategories()
  const rules = useRules()

  const [draft, setDraft] = useState(initial)
  const [amountText, setAmountText] = useState(initial.amount ? String(initial.amount) : '')
  const [shouldSaveRule, setShouldSaveRule] = useState(true)
  const [sheet, setSheet] = useState<'delete' | 'split' | 'paste' | null>(null)

  const amount = evaluateAmount(amountText)
  const kindCategories = useMemo(() => categories.filter(category => category.kind === draft.kind), [categories, draft.kind])
  const existingRuleCategory = classifyMerchant(draft.merchant, rules)
  const canOfferRule = draft.merchant.trim() !== '' && draft.category !== '' && draft.category !== UNCATEGORIZED
  const canSave = amount !== null && amount !== 0 && draft.category !== ''

  const update = (patch: Partial<TransactionInput>) => setDraft(previous => ({ ...previous, ...patch }))

  const defaultScopeOf = (categoryName: string) =>
    categories.find(category => category.name === categoryName)?.personal ? '개인' : '공동'

  const handleCategoryChange = (category: string) => update({ category, scope: defaultScopeOf(category) })

  const handleKindChange = (kind: Kind) => {
    const keepsCategory = categories.some(category => category.kind === kind && category.name === draft.category)
    update({ kind, category: keepsCategory ? draft.category : '' })
  }

  const handleMerchantBlur = () => {
    if (draft.category && draft.category !== UNCATEGORIZED) return
    const matched = classifyMerchant(draft.merchant, rules)
    if (matched) handleCategoryChange(matched)
  }

  const handlePasteApply = (text: string, parsed: ParsedPayment) => {
    const matched = classifyMerchant(parsed.merchant, rules)
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
    navigate(-1)
  }

  const handleDelete = async () => {
    if (!transaction) return
    await deleteTransaction(transaction.id)
    syncNow().catch(() => {})
    navigate(-1)
  }

  const handleSplit = async (splitAmount: number, category: string) => {
    if (!transaction) return
    await splitTransaction({ ...transaction, ...draft, amount: amount ?? transaction.amount }, splitAmount, category)
    syncNow().catch(() => {})
    navigate(-1)
  }

  return (
    <div className="page">
      <TopBar
        showBack
        title={transaction ? '내역 수정' : '내역 추가'}
        actions={
          <button type="button" className="text-button text-primary" disabled={!canSave} onClick={handleSave}>
            저장
          </button>
        }
      />

      <main className="page-content form">
        {!transaction && !captureKey && (
          <button type="button" className="button paste-button" onClick={() => setSheet('paste')}>
            카톡 알림 붙여넣기
          </button>
        )}

        <Segmented label="구분" options={KINDS} value={draft.kind} onChange={handleKindChange} />

        <label className="field">
          <span className="field-label">금액</span>
          <input
            className="field-input field-amount"
            inputMode="text"
            placeholder="예: 12000 또는 5616746-113766"
            value={amountText}
            onChange={event => setAmountText(event.target.value)}
            autoFocus={!transaction && !captureKey}
          />
          <AmountHint text={amountText} amount={amount} shareCount={draft.shareCount} />
        </label>

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
            <button
              type="button"
              className="stepper-button"
              aria-label="인원 늘리기"
              onClick={() => update({ shareCount: draft.shareCount + 1 })}
            >
              +
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label">누구</span>
          <div className="segmented" role="radiogroup" aria-label="누구">
            {PEOPLE.map(person => (
              <button
                key={person}
                type="button"
                role="radio"
                aria-checked={person === draft.person}
                className="segmented-option with-avatar"
                onClick={() => update({ person })}
              >
                <PersonAvatar person={person} size={18} />
                {person}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">가맹점·내용</span>
          <input
            className="field-input"
            placeholder="예: 스타벅스"
            value={draft.merchant}
            onChange={event => update({ merchant: event.target.value })}
            onBlur={handleMerchantBlur}
          />
        </label>

        <div className="field">
          <span className="field-label">카테고리</span>
          <CategoryChips categories={kindCategories} value={draft.category} onChange={handleCategoryChange} />
          {canOfferRule && existingRuleCategory !== draft.category && (
            <label className="checkbox">
              <input type="checkbox" checked={shouldSaveRule} onChange={event => setShouldSaveRule(event.target.checked)} />
              앞으로 "{draft.merchant.trim()}"은(는) {draft.category}(으)로 분류
            </label>
          )}
        </div>

        {draft.kind === '지출' && (
          <div className="field">
            <span className="field-label">공동·개인</span>
            <Segmented label="공동·개인" options={SCOPES} value={draft.scope} onChange={scope => update({ scope })} />
            <span className="field-hint">
              {draft.scope === '공동' ? '둘이 함께 쓴 지출이에요' : `${draft.person}의 개인 지출로 잡혀요`}
            </span>
          </div>
        )}

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

      {sheet === 'delete' && (
        <ConfirmSheet message="이 내역을 삭제할까요?" confirmLabel="삭제" onConfirm={handleDelete} onCancel={() => setSheet(null)} />
      )}
      {sheet === 'paste' && <PasteSheet onApply={handlePasteApply} onCancel={() => setSheet(null)} />}
      {sheet === 'split' && (
        <SplitSheet
          total={amount ?? draft.amount}
          categories={kindCategories}
          onSplit={handleSplit}
          onCancel={() => setSheet(null)}
        />
      )}
    </div>
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
  if (!parsed) return <p className="field-hint field-error">금액이나 결제·입금 여부를 찾지 못했어요. 직접 입력해 주세요.</p>
  return (
    <p className="field-hint">
      {parsed.isCancel ? '취소 ' : ''}
      {parsed.kind} {formatWon(parsed.amount)}
      {parsed.merchant && ` · ${parsed.merchant}`} · {formatDayLabel(parsed.occurredAt)} {formatTime(parsed.occurredAt)}
    </p>
  )
}

type AmountHintProps = { text: string; amount: number | null; shareCount: number }

function AmountHint({ text, amount, shareCount }: AmountHintProps) {
  if (text.trim() === '') return null
  if (amount === null) return <span className="field-hint field-error">계산할 수 없는 식이에요</span>

  const isExpression = /[+\-*/()]/.test(text.replace(/^-/, ''))
  const parts = []
  if (isExpression) parts.push(`= ${formatWon(amount)}`)
  if (shareCount > 1) parts.push(`내 몫 ${formatWon(myShare({ amount, shareCount }))}`)
  if (parts.length === 0) return null
  return <span className="field-hint">{parts.join(' · ')}</span>
}

type CategoryChipsProps = {
  categories: Category[]
  value: string
  onChange: (category: string) => void
}

function CategoryChips({ categories, value, onChange }: CategoryChipsProps) {
  return (
    <div className="chips" role="radiogroup" aria-label="카테고리">
      {categories.map(category => (
        <button
          key={category.name}
          type="button"
          role="radio"
          aria-checked={category.name === value}
          className="chip"
          onClick={() => onChange(category.name)}
        >
          {category.icon && <span aria-hidden="true">{category.icon} </span>}
          {category.name}
        </button>
      ))}
    </div>
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
        <CategoryChips categories={categories} value={category} onChange={setCategory} />
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
