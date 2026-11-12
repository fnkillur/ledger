import { ClipboardTextIcon, MinusIcon, PlusIcon, ReceiptIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import CategoryIcon from '../components/CategoryIcon'
import ConfirmSheet from '../components/ConfirmSheet'
import { DateTimeRow } from '../components/calendar/DateTimePicker'
import FieldHint from '../components/FieldHint'
import PersonAvatar from '../components/PersonAvatar'
import Segmented from '../components/Segmented'
import TopBar from '../components/TopBar'
import { markCapture } from '../db/captures'
import { db } from '../db/database'
import { buildPastedDraft } from '../db/pastedDraft'
import { useCategories, usePersonName, useRecentInputs, useRules, useTransaction } from '../db/hooks'
import { celebrate } from '../celebration/store'
import { deleteTransaction, getRecordActivity, recategorize, saveRule, saveTransaction, type TransactionInput } from '../db/repository'
import { evaluateAmount, formatAmountText } from '../domain/amountExpression'
import type { FrequentEntry } from '../domain/insights'
import { cheerSubline } from '../domain/celebration'
import { classifyMerchant, findSameMerchant, suggestCategory } from '../domain/classify'
import type { ParsedPayment } from '../domain/notificationParser'
import { parsePastedPayment } from '../domain/pastedPayment'
import { groupReceipt, moveReceiptItem, receiptMemo, type ReceiptGroup, type ReceiptItem } from '../domain/receipt'
import { myShare } from '../domain/stats'
import { KINDS, PEOPLE, SCOPES, scopeLabel, UNCATEGORIZED, type Category, type Kind, type Person, type Rule, type Transaction } from '../domain/types'
import { useBackHandler } from '../navigation/back'
import { LIST_PATH } from '../paths'
import { analyzeReceipt } from '../sync/api'
import { getSettings } from '../sync/settings'
import { syncNow } from '../sync/sync'
import { formatDayLabel, formatTime, formatWon, toDateKey } from '../utils/format'
import { toJpegBase64 } from '../utils/image'
import { scrollToTopOnReturn } from '../utils/scroll'
import NotFoundPage from './NotFoundPage'

const MAX_SUGGESTIONS = 6

const isRuleOfferedFor = (draft: TransactionInput, rules: Rule[]) =>
  draft.merchant.trim() !== '' && draft.category !== '' && draft.category !== UNCATEGORIZED && classifyMerchant(draft.merchant, rules) !== draft.category

const toIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString()

// 저장 버튼이 무엇이 비었는지 알려 준다.
const saveLabel = (amount: number | null, category: string, splitCount: number) => {
  if (amount === null || amount === 0) return '금액을 입력해 주세요'
  if (splitCount > 1) return `${formatWon(amount)}을 ${splitCount}개로 저장`
  if (splitCount === 1) return `${formatWon(amount)} 저장`
  if (category === '') return '카테고리를 골라 주세요'
  return `${formatWon(amount)} 저장`
}

type ReceiptState = { status: 'reading' } | { status: 'error'; message: string } | { status: 'done'; total: number; items: ReceiptItem[] }

// 마지막 글자에 받침이 있으면 '이에요', 없으면 '예요'. 한글이 아니면 받침 없는 쪽으로 본다.
const withCopula = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? `${word}이에요` : `${word}예요`
}

// 무료 한도를 넘기면 Gemini가 429로 거절한다. 그때는 무엇을 하면 되는지 알려 준다.
const toReceiptErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : '영수증을 읽지 못했어요.'
  if (/429|RESOURCE_EXHAUSTED/.test(message)) return '오늘 쓸 수 있는 영수증 분석을 다 썼어요. 잠시 뒤 다시 하거나, 카테고리를 직접 골라 주세요.'
  return message
}

type EditLocationState = { draft?: TransactionInput; captureKey?: string; receiptFile?: File } | null

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
    return <TransactionForm initial={sharedDraft ?? state?.draft ?? emptyDraft()} captureKey={state?.captureKey} receiptFile={state?.receiptFile} />
  }
  if (transaction === undefined) return null
  if (transaction === null) return <NotFoundPage />
  return <TransactionForm initial={transaction} transaction={transaction} />
}

type TransactionFormProps = {
  initial: TransactionInput
  transaction?: Transaction
  captureKey?: string
  receiptFile?: File
}

function TransactionForm({ initial, transaction, captureKey, receiptFile }: TransactionFormProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const categories = useCategories()
  const rules = useRules()
  const recent = useRecentInputs(initial.kind)

  const [draft, setDraft] = useState(initial)
  const [amountText, setAmountText] = useState(initial.amount ? String(initial.amount) : '')
  const [shouldSaveRule, setShouldSaveRule] = useState(true)
  const [shouldUpdatePast, setShouldUpdatePast] = useState(true)
  const [sheet, setSheet] = useState<'delete' | 'paste' | null>(null)
  const [receipt, setReceipt] = useState<ReceiptState | null>(null)
  const [openedPicker, setOpenedPicker] = useState<string | null>(null)

  // 입력 중인 가맹점·카테고리에 따라 달라지므로 지역 상태 뒤에 둔다.
  const pastSameMerchant =
    useLiveQuery(
      async () =>
        isRuleOfferedFor(draft, rules)
          ? findSameMerchant(await db.transactions.toArray(), { merchant: draft.merchant, kind: draft.kind, category: draft.category, exceptId: transaction?.id })
          : [],
      [draft.merchant, draft.kind, draft.category, rules, transaction?.id],
    ) ?? []

  const amount = evaluateAmount(amountText)
  const kindCategories = useMemo(() => categories.filter(category => category.kind === draft.kind), [categories, draft.kind])
  const existingRuleCategory = classifyMerchant(draft.merchant, rules)
  const categoryNames = categories.map(category => category.name)
  const canOfferRule = draft.merchant.trim() !== '' && draft.category !== '' && draft.category !== UNCATEGORIZED
  const receiptGroups = receipt?.status === 'done' && amount !== null ? groupReceipt(receipt.items, amount) : []
  const isSplitByReceipt = receiptGroups.length > 0
  const canSave = amount !== null && amount !== 0 && (isSplitByReceipt || draft.category !== '')
  const isRuleOffered = canOfferRule && existingRuleCategory !== draft.category && receipt === null
  const canUseReceipt = !transaction && draft.kind === '지출'
  // 수입은 나눠 받거나 통계에서 뺄 일이 없다(돌려받은 돈은 '정산' 카테고리가 빠진다). 예전에 넣어 둔 값만 되돌릴 수 있게 보여 준다.
  // 공금 지출은 누구 용돈도 아니라 누가 썼는지 고르지 않는다(결제한 사람은 그대로 저장된다).
  const isSharedExpense = draft.kind === '지출' && draft.scope === '공동'
  const showsSplitOptions = draft.kind === '지출' || (initial.kind === '수입' && (initial.shareCount > 1 || initial.excluded))
  const merchantQuery = draft.merchant.trim()
  const merchantSuggestions = merchantQuery
    ? recent.merchants.filter(merchant => merchant !== merchantQuery && merchant.includes(merchantQuery)).slice(0, MAX_SUGGESTIONS)
    : []

  // + 메뉴에서 영수증 사진을 고르고 들어오면 바로 읽는다. 새로고침·뒤로가기로 다시 읽지 않게 기록에서 사진을 지운다.
  const isReceiptFileHandled = useRef(false)
  useEffect(() => {
    if (!receiptFile || isReceiptFileHandled.current) return
    isReceiptFileHandled.current = true
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
    handleReceiptFile(receiptFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptFile])

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

  const handleReceiptFile = async (file: File) => {
    setReceipt({ status: 'reading' })
    try {
      const settings = getSettings()
      if (!settings.endpoint) throw new Error('구글 시트와 연결돼야 영수증을 읽을 수 있어요.')
      // + 메뉴에서 사진을 고르고 들어오면 화면이 카테고리를 불러오기 전에 읽기 시작해서 저장소에서 바로 읽는다.
      const names = (await db.categories.orderBy('order').toArray())
        .filter(category => category.kind === draft.kind && !category.excluded && category.name !== UNCATEGORIZED)
        .map(category => category.name)
      const result = await analyzeReceipt(settings, { image: await toJpegBase64(file), mimeType: 'image/jpeg', categories: names })
      const itemSum = result.items.reduce((sum, item) => sum + item.amount, 0)
      if (amount === null || amount === 0) setAmountText(String(result.total || itemSum))
      if (!draft.merchant.trim() && result.merchant) update({ merchant: result.merchant })
      setReceipt({ status: 'done', total: result.total || itemSum, items: result.items })
    } catch (caught) {
      setReceipt({ status: 'error', message: toReceiptErrorMessage(caught) })
    }
  }

  const handleReceiptMove = (index: number, category: string) =>
    setReceipt(previous => (previous?.status === 'done' ? { ...previous, items: moveReceiptItem(previous.items, index, category) } : previous))

  const saveSplit = async () => {
    const merchant = draft.merchant.trim()
    const saved = []
    for (const group of receiptGroups) {
      const memo = [draft.memo.trim(), receiptMemo(group.items)].filter(Boolean).join(' · ')
      saved.push(await saveTransaction({ ...draft, merchant, amount: group.amount, category: group.category, scope: defaultScopeOf(group.category), memo }))
    }
    if (captureKey) await markCapture(captureKey, '기록됨', saved[0])
    syncNow().catch(() => {})
    scrollToTopOnReturn()
    goBack()
    const title = saved.length === 1 ? `${merchant || saved[0].category} ${formatWon(saved[0].amount)} 기록했어요` : `${merchant || '영수증'} ${saved.length}개로 나눠 기록했어요`
    celebrate({ title, transactionIds: saved.map(item => item.id) }, cheerSubline(await getRecordActivity(draft.person)))
  }

  const handleSave = async () => {
    if (!canSave) return
    if (isSplitByReceipt) return saveSplit()
    const splitOptions = showsSplitOptions ? {} : { shareCount: 1, excluded: false }
    const saved = await saveTransaction({ ...draft, ...splitOptions, amount: amount!, merchant: draft.merchant.trim() }, transaction?.id)
    if (isRuleOffered && shouldSaveRule) {
      await saveRule(draft.merchant, draft.category)
      if (shouldUpdatePast && pastSameMerchant.length > 0) await recategorize(pastSameMerchant, draft.category)
    }
    if (captureKey) await markCapture(captureKey, '기록됨', saved)
    syncNow().catch(() => {})
    if (!transaction) scrollToTopOnReturn()
    goBack()
    if (!transaction) {
      const title = `${saved.merchant || saved.category} ${formatWon(saved.amount)} 기록했어요`
      celebrate({ title, transactionIds: [saved.id] }, cheerSubline(await getRecordActivity(draft.person)))
    }
  }

  const handleDelete = async () => {
    if (!transaction) return
    await deleteTransaction(transaction.id)
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

      <main className="page-content tx-form">
        <section className="tx-hero">
          <div className="tx-hero-top">
            <div className="tx-kind">
              <Segmented label="구분" options={KINDS} value={draft.kind} onChange={handleKindChange} />
            </div>
            {canUseReceipt && <ReceiptPicker hasReceipt={receipt !== null} onPick={handleReceiptFile} onClear={() => setReceipt(null)} />}
          </div>
          <AmountInput text={amountText} kind={draft.kind} onChange={setAmountText} autoFocus={!transaction && !captureKey && !receiptFile} />
          <AmountHint text={amountText} amount={amount} shareCount={showsSplitOptions ? draft.shareCount : 1} />
        </section>

        <section className="form-group">
          <div className="form-row">
            <input
              className="tx-merchant"
              aria-label="가맹점·내용"
              placeholder={draft.kind === '지출' ? '어디에 썼나요?' : '어디서 받았나요?'}
              enterKeyHint="done"
              value={draft.merchant}
              onChange={event => handleMerchantChange(event.target.value)}
              onBlur={handleMerchantBlur}
            />
          </div>
          {merchantSuggestions.length > 0 && (
            <div className="form-row tx-suggestions">
              {merchantSuggestions.map(merchant => (
                <button key={merchant} type="button" className="tx-suggestion" onClick={() => handleMerchantChange(merchant)}>
                  {merchant}
                </button>
              ))}
            </div>
          )}
        </section>

        {!transaction && !captureKey && receipt === null && draft.merchant === '' && recent.frequent.length > 0 && (
          <FrequentEntries entries={recent.frequent} onPick={handleFrequentPick} />
        )}

        <section className="tx-section" aria-label="카테고리">
          <div className="tx-section-header">
            <h2 className="tx-section-title">카테고리</h2>
          </div>
          {receipt ? (
            <ReceiptPanel receipt={receipt} groups={receiptGroups} amount={amount} categories={kindCategories} onMove={handleReceiptMove} onClear={() => setReceipt(null)} />
          ) : (
            <CategoryChips categories={kindCategories} recent={recent.categories} value={draft.category} onChange={handleCategoryChange} />
          )}
          {isRuleOffered && (
            <div className="form-group">
              <div className="form-row">
                <span className="rule-text">
                  앞으로 "{draft.merchant.trim()}"은(는)
                  <span>{draft.category}(으)로 자동 분류</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={shouldSaveRule}
                  aria-label="자동 분류 규칙 저장"
                  className="switch"
                  onClick={() => setShouldSaveRule(!shouldSaveRule)}
                />
              </div>
              {shouldSaveRule && pastSameMerchant.length > 0 && (
                <div className="form-row">
                  <span className="rule-text">
                    지난 내역 {pastSameMerchant.length}건도
                    <span>{draft.category}(으)로 바꾸기</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={shouldUpdatePast}
                    aria-label="지난 내역도 바꾸기"
                    className="switch"
                    onClick={() => setShouldUpdatePast(!shouldUpdatePast)}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        <section className="form-group">
          {draft.kind === '지출' && (
            <div className="form-row">
              <span className="form-row-text">
                공금·용돈
                <small>{draft.scope === '공동' ? '공금에서 나간 지출' : '결제한 사람 용돈에서 나간 지출'}</small>
              </span>
              <div className="tx-compact">
                <Segmented label="공금·용돈" options={SCOPES} labelOf={scopeLabel} value={draft.scope} onChange={scope => update({ scope })} />
              </div>
            </div>
          )}
          {!isSharedExpense && (
            <div className="form-row">
              <span>누가</span>
              <PersonSegmented value={draft.person} onChange={person => update({ person })} />
            </div>
          )}
          <DateTimeRow
            label="날짜"
            pickerId="occurred"
            date={toDateKey(draft.occurredAt)}
            time={formatTime(draft.occurredAt)}
            showTime
            opened={openedPicker}
            onToggle={picker => setOpenedPicker(previous => (previous === picker ? null : picker))}
            onDate={date => update({ occurredAt: toIso(date, formatTime(draft.occurredAt)) })}
            onTime={time => update({ occurredAt: toIso(toDateKey(draft.occurredAt), time) })}
          />
        </section>

        <section className="form-group">
          {showsSplitOptions && (
            <div className="form-row">
              <span>나눠 낸 인원</span>
              <div className="tx-stepper">
                <button
                  type="button"
                  className="tx-stepper-button"
                  aria-label="인원 줄이기"
                  disabled={draft.shareCount <= 1}
                  onClick={() => update({ shareCount: draft.shareCount - 1 })}
                >
                  <MinusIcon size={16} weight="bold" />
                </button>
                <span className="tx-stepper-value">{draft.shareCount === 1 ? '혼자' : `${draft.shareCount}명`}</span>
                <button type="button" className="tx-stepper-button" aria-label="인원 늘리기" onClick={() => update({ shareCount: draft.shareCount + 1 })}>
                  <PlusIcon size={16} weight="bold" />
                </button>
              </div>
            </div>
          )}
          {showsSplitOptions && (
            <div className="form-row">
              <span className="form-row-text">
                통계에서 제외
                <small>대신 결제해 준 돈 등</small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={draft.excluded}
                aria-label="통계에서 제외"
                className="switch"
                onClick={() => update({ excluded: !draft.excluded })}
              />
            </div>
          )}
          <div className="form-row">
            <span>메모</span>
            <input
              className="tx-memo"
              aria-label="메모"
              placeholder="남길 말"
              enterKeyHint="done"
              value={draft.memo}
              onChange={event => update({ memo: event.target.value })}
            />
          </div>
        </section>

        {draft.rawText && (
          <details className="raw-text">
            <summary>원본 알림</summary>
            <pre>{draft.rawText}</pre>
          </details>
        )}

        {transaction && (
          <section className="form-group">
            <button type="button" className="form-row form-row-danger" onClick={() => setSheet('delete')}>
              삭제
            </button>
          </section>
        )}
      </main>

      <div className="bottom-cta">
        <button type="button" className="button button-primary" disabled={!canSave} onClick={handleSave}>
          {saveLabel(amount, draft.category, receiptGroups.length)}
        </button>
      </div>

      {sheet === 'delete' && (
        <ConfirmSheet message="이 내역을 삭제할까요?" confirmLabel="삭제" onConfirm={handleDelete} onCancel={() => setSheet(null)} />
      )}
      {sheet === 'paste' && <PasteSheet onApply={handlePasteApply} onCancel={() => setSheet(null)} />}
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

type ReceiptPickerProps = {
  hasReceipt: boolean
  onPick: (file: File) => void
  onClear: () => void
}

function ReceiptPicker({ hasReceipt, onPick, onClear }: ReceiptPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onPick(file)
  }

  if (hasReceipt) {
    return (
      <button type="button" className="text-button tx-section-action" onClick={onClear}>
        영수증 지우기
      </button>
    )
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleChange} />
      <button type="button" className="text-button text-primary tx-section-action" onClick={() => inputRef.current?.click()}>
        <ReceiptIcon size={16} weight="bold" aria-hidden="true" />
        영수증 사진
      </button>
    </>
  )
}

type ReceiptPanelProps = {
  receipt: ReceiptState
  groups: ReceiptGroup[]
  amount: number | null
  categories: Category[]
  onMove: (index: number, category: string) => void
  onClear: () => void
}

// 영수증 품목을 카테고리별로 묶어 보여준다. 품목을 누르면 다른 카테고리로 옮길 수 있다.
function ReceiptPanel({ receipt, groups, amount, categories, onMove, onClear }: ReceiptPanelProps) {
  const [movingItem, setMovingItem] = useState<ReceiptItem | null>(null)

  useBackHandler(() => setMovingItem(null), movingItem !== null)

  if (receipt.status === 'reading') return <p className="receipt-status">영수증을 읽고 있어요…</p>
  if (receipt.status === 'error') {
    return (
      <div className="receipt-error">
        <FieldHint tone="error">{receipt.message}</FieldHint>
        <button type="button" className="button" onClick={onClear}>
          직접 고르기
        </button>
      </div>
    )
  }
  if (groups.length === 0) return <FieldHint tone="error">금액을 입력하면 영수증대로 나눠요.</FieldHint>

  const isAdjusted = amount !== null && amount !== receipt.total

  return (
    <div className="receipt-panel">
      <p className="receipt-status">
        {groups.length === 1 ? `품목이 모두 ${withCopula(groups[0].category)}` : `영수증에서 ${groups.length}개로 나눴어요`}
        {isAdjusted && <small>영수증 합계 {formatWon(receipt.total)}을 결제 금액에 맞춰 나눴어요</small>}
      </p>
      <ul className="receipt-groups">
        {groups.map(group => (
          <li key={group.category} className="receipt-group">
            <div className="receipt-group-header">
              <CategoryIcon name={group.category} emoji={categories.find(category => category.name === group.category)?.icon} size={16} />
              <strong>{group.category}</strong>
              <span className="receipt-group-amount">{formatWon(group.amount)}</span>
            </div>
            <div className="receipt-items">
              {group.items.map(item => (
                <button key={receipt.items.indexOf(item)} type="button" className="receipt-item" onClick={() => setMovingItem(item)}>
                  {item.name} <span>{formatWon(item.amount)}</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {movingItem && (
        <div className="sheet-backdrop" onClick={() => setMovingItem(null)}>
          <div className="sheet" role="dialog" aria-label="품목 카테고리 바꾸기" onClick={event => event.stopPropagation()}>
            <p className="sheet-message">
              {movingItem.name} {formatWon(movingItem.amount)}을(를) 어디로 옮길까요?
            </p>
            <CategoryChips
              categories={categories.filter(category => !category.excluded && category.name !== UNCATEGORIZED)}
              value={movingItem.category}
              isInitiallyExpanded
              onChange={category => {
                onMove(receipt.items.indexOf(movingItem), category)
                setMovingItem(null)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

type PasteSheetProps = {
  onApply: (text: string, parsed: ParsedPayment) => void
  onCancel: () => void
}

function PasteSheet({ onApply, onCancel }: PasteSheetProps) {
  useBackHandler(onCancel)

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

type CategoryChipsProps = {
  categories: Category[]
  recent?: string[]
  value: string
  onChange: (category: string) => void
  isInitiallyExpanded?: boolean
}

function CategoryChips({ categories, recent = [], value, onChange, isInitiallyExpanded = false }: CategoryChipsProps) {
  const [isExpanded, setIsExpanded] = useState(isInitiallyExpanded)

  const ordered = orderByRecent(categories, recent)
  const visible = isExpanded ? ordered : ordered.slice(0, COLLAPSED_COUNT)
  const hiddenSelected = !isExpanded && value && !visible.some(category => category.name === value)
  const shown = hiddenSelected ? [...visible.slice(0, COLLAPSED_COUNT - 1), ...ordered.filter(category => category.name === value)] : visible

  return (
    <div className="category-chips" role="radiogroup" aria-label="카테고리">
      {shown.map(category => (
        <button
          key={category.name}
          type="button"
          role="radio"
          aria-checked={category.name === value}
          className="category-chip"
          onClick={() => onChange(category.name)}
        >
          <CategoryIcon name={category.name} emoji={category.icon} size={16} />
          {category.name}
        </button>
      ))}
      {ordered.length > COLLAPSED_COUNT && (
        <button type="button" className="category-chip is-more" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? '접기' : `+${ordered.length - shown.length}`}
        </button>
      )}
    </div>
  )
}

type AmountInputProps = {
  text: string
  kind: Kind
  onChange: (text: string) => void
  autoFocus: boolean
}

const AMOUNT_OPERATORS = [
  { label: '+', value: '+' },
  { label: '−', value: '-' },
  { label: '×', value: '*' },
  { label: '÷', value: '/' },
]

const toDisplayAmount = (text: string) => formatAmountText(text).replace(/\*/g, '×').replace(/\//g, '÷')

const fromDisplayAmount = (display: string) => display.replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')

// 입력한 글자 폭만큼만 칸이 늘어나서 '원'이 숫자 바로 옆에 붙는다.
// 숫자 키패드에는 사칙연산 기호가 없어서, 입력 중에만 기호 버튼을 띄운다.
function AmountInput({ text, kind, onChange, autoFocus }: AmountInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const isPointerDown = useRef(false)
  const cancelPendingHide = useRef<(() => void) | null>(null)

  const display = toDisplayAmount(text)

  useEffect(() => {
    const press = () => (isPointerDown.current = true)
    const release = () => (isPointerDown.current = false)
    window.addEventListener('pointerdown', press, true)
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', release, true)
    return () => {
      window.removeEventListener('pointerdown', press, true)
      window.removeEventListener('pointerup', release, true)
      window.removeEventListener('pointercancel', release, true)
      cancelPendingHide.current?.()
    }
  }, [])

  const handleFocus = () => {
    cancelPendingHide.current?.()
    setIsFocused(true)
  }

  // 다른 버튼을 누르다가 포커스가 빠질 때 기호 줄이 바로 사라지면, 그 아래 버튼이 위로 밀려 탭이 빗나간다.
  // 손을 떼어 탭이 끝난 뒤에 숨긴다.
  const handleBlur = () => {
    if (!isPointerDown.current) return setIsFocused(false)
    const hide = () => {
      cancelPendingHide.current?.()
      setIsFocused(false)
    }
    window.addEventListener('click', hide)
    window.addEventListener('pointercancel', hide)
    cancelPendingHide.current = () => {
      window.removeEventListener('click', hide)
      window.removeEventListener('pointercancel', hide)
      cancelPendingHide.current = null
    }
  }

  return (
    <>
      <label className={`tx-amount amount-${kind}`}>
        <span className="tx-amount-field">
          <span className="tx-amount-mirror" aria-hidden="true">
            {display || '0'}
          </span>
          <input
            aria-label="금액"
            inputMode="numeric"
            size={1}
            placeholder="0"
            value={display}
            onChange={event => onChange(fromDisplayAmount(event.target.value))}
            onFocus={handleFocus}
            onBlur={handleBlur}
            autoFocus={autoFocus}
          />
        </span>
        <span className="tx-amount-unit">원</span>
      </label>
      {isFocused && (
        <div className="tx-amount-operators">
          {AMOUNT_OPERATORS.map(operator => (
            <button
              key={operator.value}
              type="button"
              aria-label={`${operator.label} 넣기`}
              onPointerDown={event => event.preventDefault()}
              onClick={() => onChange(text + operator.value)}
            >
              {operator.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function PersonSegmented({ value, onChange }: { value: Person; onChange: (person: Person) => void }) {
  const personName = usePersonName()

  return (
    <div className="segmented tx-compact" role="radiogroup" aria-label="누가">
      {PEOPLE.map(person => (
        <button
          key={person}
          type="button"
          role="radio"
          aria-checked={person === value}
          className="segmented-option with-avatar"
          onClick={() => onChange(person)}
        >
          <PersonAvatar person={person} size={18} />
          {personName(person)}
        </button>
      ))}
    </div>
  )
}

export default EditPage
