import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_CATEGORIES } from '../domain/defaultCategories'
import type { Category, Rule, SharedSettings, Transaction } from '../domain/types'
import type { CapturedNotification, ParsedPayment } from '../domain/notificationParser'

export type CaptureStatus = '대기' | '중복' | '기록됨' | '무시'

export type CaptureItem = CapturedNotification & {
  parsed: ParsedPayment
  status: CaptureStatus
  transactionId?: string
}

export type SharedSettingsRecord = SharedSettings & { key: 'shared'; updatedAt: string }

export type SyncMeta = {
  key: 'sync'
  lastServerTime: string
  lastSyncedAt: string
}

export const db = new Dexie('ledger') as Dexie & {
  transactions: EntityTable<Transaction, 'id'>
  categories: EntityTable<Category, 'name'>
  rules: EntityTable<Rule, 'keyword'>
  outbox: EntityTable<{ id: string; type: 'transaction' | 'rule' | 'settings' }, 'id'>
  shared: EntityTable<SharedSettingsRecord, 'key'>
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

const defaultsByName = new Map(DEFAULT_CATEGORIES.map(category => [category.name, category]))

db.version(2)
  .stores({ shared: 'key' })
  .upgrade(transaction =>
    transaction
      .table('categories')
      .toCollection()
      .modify((category: Category) => {
        const defaults = defaultsByName.get(category.name)
        category.fixed ??= defaults?.fixed ?? false
        category.icon ??= defaults?.icon ?? ''
      }),
  )
