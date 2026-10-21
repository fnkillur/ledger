import { db } from '../db/database'
import { DEFAULT_CATEGORIES } from '../domain/defaultCategories'
import type { Rule, Transaction } from '../domain/types'
import { pull, push } from './api'
import { getSettings, isSyncConfigured } from './settings'

export const ensureCategories = async () => {
  if ((await db.categories.count()) > 0) return
  await db.categories.bulkPut(DEFAULT_CATEGORIES)
}

const findLatest = (item: { id: string; type: 'transaction' | 'rule' | 'settings' }) => {
  if (item.type === 'transaction') return db.transactions.get(item.id)
  if (item.type === 'rule') return db.rules.get(item.id)
  return db.shared.get('shared')
}

const pushOutbox = async () => {
  const pending = await db.outbox.toArray()
  if (pending.length === 0) return

  const transactionIds = pending.filter(item => item.type === 'transaction').map(item => item.id)
  const ruleKeywords = pending.filter(item => item.type === 'rule').map(item => item.id)
  const transactions = (await db.transactions.bulkGet(transactionIds)).filter((item): item is Transaction => !!item)
  const rules = (await db.rules.bulkGet(ruleKeywords)).filter((item): item is Rule => !!item)
  const shared = pending.some(item => item.type === 'settings') ? await db.shared.get('shared') : undefined

  await push(getSettings(), {
    transactions,
    rules,
    settings: shared && { 월예산: shared.월예산, 월저축목표: shared.월저축목표 },
  })

  // 전송 중 다시 수정된 항목은 outbox에 남겨 다음 동기화에 보낸다.
  await db.transaction('rw', [db.outbox, db.transactions, db.rules, db.shared], async () => {
    const sentAt = new Map([...transactions, ...rules].map(item => ['id' in item ? item.id : item.keyword, item.updatedAt]))
    if (shared) sentAt.set('shared', shared.updatedAt)
    const current = await db.outbox.toArray()
    const doneIds = await Promise.all(
      current.map(async item => {
        const latest = await findLatest(item)
        return latest && sentAt.get(item.id) === latest.updatedAt ? item.id : null
      }),
    )
    await db.outbox.bulkDelete(doneIds.filter((id): id is string => id !== null))
  })
}

const pullChanges = async () => {
  const meta = await db.meta.get('sync')
  const response = await pull(getSettings(), meta?.lastServerTime ?? '')
  const pendingIds = new Set((await db.outbox.toArray()).map(item => item.id))

  await db.transaction('rw', [db.transactions, db.rules, db.categories, db.meta, db.shared], async () => {
    await db.transactions.bulkPut(response.transactions.filter(item => !pendingIds.has(item.id)))
    await db.rules.bulkPut(response.rules.filter(item => !pendingIds.has(item.keyword)))
    if (response.categories.length > 0) {
      await db.categories.clear()
      await db.categories.bulkPut(response.categories)
    }
    if (response.settings && !pendingIds.has('shared')) {
      await db.shared.put({
        key: 'shared',
        월예산: response.settings.월예산 ?? 0,
        월저축목표: response.settings.월저축목표 ?? 0,
        updatedAt: response.serverTime,
      })
    }
    await db.meta.put({ key: 'sync', lastServerTime: response.serverTime, lastSyncedAt: new Date().toISOString() })
  })
}

let running: Promise<void> | null = null

export const syncNow = () => {
  if (!isSyncConfigured(getSettings())) return Promise.resolve()
  running ??= (async () => {
    try {
      await pushOutbox()
      await pullChanges()
    } finally {
      running = null
    }
  })()
  return running
}

export const resetSync = async () => {
  await db.meta.delete('sync')
}
