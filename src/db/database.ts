import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_CATEGORIES } from '../domain/defaultCategories'
import type { Category, Person, Rule, SharedSettings, Transaction } from '../domain/types'
import type { CapturedNotification, ParsedPayment } from '../domain/notificationParser'

export type CaptureStatus = '대기' | '중복' | '기록됨' | '무시'

export type CaptureItem = CapturedNotification & {
  parsed: ParsedPayment
  status: CaptureStatus
  transactionId?: string
  // iOS 단축어가 시트 '수집함' 탭으로 보낸 문자. 처리 상태를 시트에도 돌려보낸다.
  fromSheet?: boolean
  person?: Person
  updatedAt?: string
}

export type OutboxItem = { id: string; type: 'transaction' | 'rule' | 'settings' | 'capture' }

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
  outbox: EntityTable<OutboxItem, 'id'>
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

db.version(3).upgrade(async transaction => {
  await transaction
    .table('transactions')
    .toCollection()
    .modify((item: Transaction) => {
      item.scope ??= '공동'
    })
  await transaction
    .table('categories')
    .toCollection()
    .modify((category: Category) => {
      category.personal ??= defaultsByName.get(category.name)?.personal ?? false
    })
})
