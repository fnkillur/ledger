import Dexie, { type EntityTable } from 'dexie'
import type { Category, Rule, Transaction } from '../domain/types'
import type { CapturedNotification, ParsedPayment } from '../domain/notificationParser'

export type CaptureStatus = '대기' | '중복' | '기록됨' | '무시'

export type CaptureItem = CapturedNotification & {
  parsed: ParsedPayment
  status: CaptureStatus
  transactionId?: string
}

export type SyncMeta = {
  key: 'sync'
  lastServerTime: string
  lastSyncedAt: string
}

export const db = new Dexie('ledger') as Dexie & {
  transactions: EntityTable<Transaction, 'id'>
  categories: EntityTable<Category, 'name'>
  rules: EntityTable<Rule, 'keyword'>
  outbox: EntityTable<{ id: string; type: 'transaction' | 'rule' }, 'id'>
  captures: EntityTable<CaptureItem, 'key'>
  meta: EntityTable<SyncMeta, 'key'>
}

db.version(1).stores({
  transactions: 'id, occurredAt, category, deleted',
  categories: 'name, kind, order',
  rules: 'keyword',
  outbox: 'id',
  captures: 'key, status, postedAt',
  meta: 'key',
})
