import Dexie, { type EntityTable } from 'dexie'
import type { CalendarEvent, CalendarEventInput, CalendarEventRef, RepeatScope } from '../domain/calendar'
import type { CycleItem } from '../domain/cycle'
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

// skippedCapture: 결제 문자가 아니라서 앱이 걸러 낸 시트 수집함 문자. 시트에도 '무시'로 돌려보낸다.
export type OutboxItem = { id: string; type: 'transaction' | 'rule' | 'settings' | 'capture' | 'skippedCapture' | 'cycle' }

export type SharedSettingsRecord = SharedSettings & { key: 'shared'; updatedAt: string }

export type SyncMeta = {
  key: 'sync'
  lastServerTime: string
  lastSyncedAt: string
}

// 구글 캘린더로 보낼 작업. 보내기 전에는 앱 저장소에 먼저 반영해 둔다.
// createId는 서버가 새 일정을 만들 때 쓸 번호라, 같은 작업을 다시 보내도 일정이 두 번 생기지 않는다.
export type CalendarOp =
  | { seq?: number; type: 'save'; input: CalendarEventInput; scope?: RepeatScope; localId?: string; createId?: string }
  | { seq?: number; type: 'delete'; ref: CalendarEventRef; scope: RepeatScope }

export type CalendarMeta = { key: 'window'; start: string; end: string; fetchedAt: string; error?: string }

export const db = new Dexie('ledger') as Dexie & {
  transactions: EntityTable<Transaction, 'id'>
  categories: EntityTable<Category, 'name'>
  rules: EntityTable<Rule, 'keyword'>
  outbox: EntityTable<OutboxItem, 'id'>
  shared: EntityTable<SharedSettingsRecord, 'key'>
  captures: EntityTable<CaptureItem, 'key'>
  meta: EntityTable<SyncMeta, 'key'>
  calendarEvents: EntityTable<CalendarEvent, 'id'>
  calendarOutbox: EntityTable<CalendarOp, 'seq'>
  calendarMeta: EntityTable<CalendarMeta, 'key'>
  cycles: EntityTable<CycleItem, 'id'>
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

// 캘린더 원본은 구글 캘린더라, 달별로 받은 일정을 그대로 캐시만 한다.
db.version(4).stores({ calendarMonths: 'monthKey' })

// 달별 캐시 대신 일정 회차를 통째로 받아 두고, 보낼 작업은 대기열에 쌓는다.
db.version(5).stores({ calendarMonths: null, calendarEvents: 'id, seriesId', calendarOutbox: '++seq', calendarMeta: 'key' })

db.version(6).stores({ cycles: 'id', cycleLogs: 'id, cycleId' })

// 주기의 마지막 날은 캘린더 일정에서 읽으므로 직접 남긴 기록은 지운다.
db.version(7).stores({ cycleLogs: null })

// 일정 키워드가 생기기 전에 받아 둔 주기 항목은 이름으로 찾도록 빈 키워드를 채운다.
db.version(8)
  .stores({})
  .upgrade(transaction =>
    transaction
      .table('cycles')
      .toCollection()
      .modify(item => {
        item.keyword ??= ''
      }),
  )

// 주기 항목에 기준일이 생겼다. 예전 항목은 비워 두면 마지막 일정을 기준으로 센다.
db.version(9)
  .stores({})
  .upgrade(transaction =>
    transaction
      .table('cycles')
      .toCollection()
      .modify(item => {
        item.anchor ??= null
      }),
  )
