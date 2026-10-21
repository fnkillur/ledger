import { classifyMerchant } from '../domain/classify'
import { isSamePayment, parsePaymentNotification, type CapturedNotification } from '../domain/notificationParser'
import { UNCATEGORIZED, type Person, type Transaction } from '../domain/types'
import { isCaptureSupported, NotificationCapture } from '../native/notificationCapture'
import { db, type CaptureItem } from './database'
import type { TransactionInput } from './repository'

const DUPLICATE_LOOKBACK_MS = 10 * 60 * 1000

const findDuplicate = (item: Pick<CaptureItem, 'parsed'>, candidates: { parsed: CaptureItem['parsed'] }[]) =>
  candidates.some(candidate => isSamePayment(item.parsed, candidate.parsed))

export const ingestCaptures = async (notifications: CapturedNotification[]) => {
  const parsedItems = notifications
    .map(notification => ({ notification, parsed: parsePaymentNotification(notification) }))
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
    accepted.push({ ...notification, parsed, status: isDuplicate ? '중복' : '대기' })
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
    rawText: `[${capture.appLabel}] ${capture.title}\n${capture.text}`,
  }
}

export const markCapture = (key: string, status: CaptureItem['status'], transaction?: Transaction) =>
  db.captures.update(key, { status, transactionId: transaction?.id })
