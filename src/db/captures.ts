import { classifyMerchant } from '../domain/classify'
import { isSamePayment, parsePaymentNotification, type CapturedNotification, type ParsedPayment } from '../domain/notificationParser'
import { parsePastedPayment } from '../domain/pastedPayment'
import { PEOPLE, UNCATEGORIZED, type Person, type Transaction } from '../domain/types'
import { isCaptureSupported, NotificationCapture } from '../native/notificationCapture'
import { db, type CaptureItem } from './database'
import type { TransactionInput } from './repository'

const DUPLICATE_LOOKBACK_MS = 10 * 60 * 1000

const findDuplicate = (item: Pick<CaptureItem, 'parsed'>, candidates: { parsed: CaptureItem['parsed'] }[]) =>
  candidates.some(candidate => isSamePayment(item.parsed, candidate.parsed))

export const ingestCaptures = async (
  notifications: CapturedNotification[],
  extra: (notification: CapturedNotification) => Partial<CaptureItem> = () => ({}),
  parse: (notification: CapturedNotification) => ParsedPayment | null = parsePaymentNotification,
) => {
  const parsedItems = notifications
    .map(notification => ({ notification, parsed: parse(notification) }))
    .filter((item): item is { notification: CapturedNotification; parsed: NonNullable<typeof item.parsed> } => !!item.parsed)
  if (parsedItems.length === 0) return 0

  const earliest = Math.min(...parsedItems.map(item => item.notification.postedAt)) - DUPLICATE_LOOKBACK_MS
  const recentCaptures = await db.captures.where('postedAt').aboveOrEqual(earliest).toArray()
  const recentTransactions = (await db.transactions.where('occurredAt').aboveOrEqual(new Date(earliest).toISOString()).toArray())
    .filter(transaction => !transaction.deleted)
    .map(transaction => ({ parsed: { kind: transaction.kind, amount: transaction.amount, occurredAt: transaction.occurredAt, merchant: '', isCancel: false } }))

  const knownKeys = new Set(recentCaptures.map(capture => capture.key))
  const accepted: CaptureItem[] = []

  parsedItems.forEach(({ notification, parsed }) => {
    if (knownKeys.has(notification.key)) return
    const isDuplicate = findDuplicate({ parsed }, [...recentCaptures.filter(capture => capture.status !== '무시'), ...accepted, ...recentTransactions])
    accepted.push({ ...notification, ...extra(notification), parsed, status: isDuplicate ? '중복' : '대기' })
    knownKeys.add(notification.key)
  })

  await db.captures.bulkPut(accepted)
  return accepted.filter(item => item.status === '대기').length
}

export const pullNativeCaptures = async () => {
  if (!isCaptureSupported()) return 0
  const { captures } = await NotificationCapture.readCaptures()
  if (captures.length === 0) return 0
  const added = await ingestCaptures(captures)
  await NotificationCapture.removeCaptures({ keys: captures.map(capture => capture.key) })
  return added
}

export const toTransactionInput = async (capture: CaptureItem, person: Person): Promise<TransactionInput> => {
  const rules = await db.rules.toArray()
  const category = classifyMerchant(capture.parsed.merchant, rules)
  const isPersonal = category ? (await db.categories.get(category))?.personal === true : false
  return {
    occurredAt: capture.parsed.occurredAt,
    person,
    kind: capture.parsed.kind,
    amount: capture.parsed.isCancel ? -capture.parsed.amount : capture.parsed.amount,
    shareCount: 1,
    merchant: capture.parsed.merchant,
    category: category ?? (capture.parsed.kind === '지출' ? UNCATEGORIZED : ''),
    excluded: false,
    source: '알림',
    memo: capture.parsed.isCancel ? '결제 취소' : '',
    rawText: capture.title ? `[${capture.appLabel}] ${capture.title}\n${capture.text}` : capture.text,
    scope: isPersonal ? '개인' : '공동',
  }
}

export type SheetCapture = { key: string; receivedAt: string; person: string; text: string; status: string }

const SHEET_APP_LABEL = '문자'

// 시트 수집함의 새 문자는 수집함에 넣고, 다른 기기에서 이미 처리한 문자는 상태만 맞춘다.
export const ingestSheetCaptures = async (rows: SheetCapture[], pendingKeys: Set<string>) => {
  const known = await db.captures.bulkGet(rows.map(row => row.key))
  const processed = rows.filter((row, index) => known[index] && row.status !== '대기' && known[index]!.status !== row.status && !pendingKeys.has(row.key))
  await Promise.all(processed.map(row => db.captures.update(row.key, { status: row.status as CaptureItem['status'] })))

  const fresh = rows.filter((row, index) => !known[index] && row.status === '대기')
  const personOf = new Map(fresh.map(row => [row.key, PEOPLE.find(person => person === row.person)]))
  return ingestCaptures(
    fresh.map(row => ({ key: row.key, packageName: 'sheet', appLabel: SHEET_APP_LABEL, title: '', text: row.text, postedAt: Date.parse(row.receivedAt) })),
    notification => ({ fromSheet: true, person: personOf.get(notification.key) }),
    // 문자는 받은 시각보다 본문에 적힌 결제 시각이 정확하다.
    notification => parsePastedPayment(notification.text, new Date(notification.postedAt)),
  )
}

export const markCapture = async (key: string, status: CaptureItem['status'], transaction?: Transaction) => {
  const capture = await db.captures.get(key)
  await db.transaction('rw', db.captures, db.outbox, async () => {
    await db.captures.update(key, { status, transactionId: transaction?.id, updatedAt: new Date().toISOString() })
    if (capture?.fromSheet) await db.outbox.put({ id: key, type: 'capture' })
  })
}
