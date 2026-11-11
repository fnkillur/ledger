import { ingestSheetCaptures } from '../db/captures'
import { db, type CaptureItem, type OutboxItem } from '../db/database'
import { anniversariesFromSettings, anniversariesToSettings } from '../domain/anniversary'
import { DEFAULT_CATEGORIES } from '../domain/defaultCategories'
import { nicknamesFromSettings, nicknamesToSettings } from '../domain/nickname'
import type { CycleItem } from '../domain/cycle'
import type { Rule, Transaction } from '../domain/types'
import { isCaptureSupported } from '../native/notificationCapture'
import { pull, push } from './api'
import { getSettings, isSyncConfigured } from './settings'

export const ensureCategories = async () => {
  if ((await db.categories.count()) > 0) return
  await db.categories.bulkPut(DEFAULT_CATEGORIES)
}

const findLatest = (item: OutboxItem) => {
  if (item.type === 'transaction') return db.transactions.get(item.id)
  if (item.type === 'rule') return db.rules.get(item.id)
  if (item.type === 'capture') return db.captures.get(item.id)
  if (item.type === 'cycle') return db.cycles.get(item.id)
  return db.shared.get('shared')
}

// 없어진 기능(주기 기록)이 남긴 항목은 보낼 곳이 없어 지운다.
const OUTBOX_TYPES = new Set<string>(['transaction', 'rule', 'settings', 'capture', 'skippedCapture', 'cycle'] satisfies OutboxItem['type'][])

const pushOutbox = async () => {
  const stale = (await db.outbox.toArray()).filter(item => !OUTBOX_TYPES.has(item.type))
  if (stale.length > 0) await db.outbox.bulkDelete(stale.map(item => item.id))
  const pending = await db.outbox.toArray()
  if (pending.length === 0) return

  const transactionIds = pending.filter(item => item.type === 'transaction').map(item => item.id)
  const ruleKeywords = pending.filter(item => item.type === 'rule').map(item => item.id)
  const transactions = (await db.transactions.bulkGet(transactionIds)).filter((item): item is Transaction => !!item)
  const rules = (await db.rules.bulkGet(ruleKeywords)).filter((item): item is Rule => !!item)
  const shared = pending.some(item => item.type === 'settings') ? await db.shared.get('shared') : undefined
  const captures = (await db.captures.bulkGet(pending.filter(item => item.type === 'capture').map(item => item.id))).filter(
    (item): item is CaptureItem => !!item,
  )
  const skippedKeys = new Set(pending.filter(item => item.type === 'skippedCapture').map(item => item.id))
  const cycles = (await db.cycles.bulkGet(pending.filter(item => item.type === 'cycle').map(item => item.id))).filter((item): item is CycleItem => !!item)

  const response = await push(getSettings(), {
    transactions,
    rules,
    settings: shared && {
      월예산: shared.월예산,
      월저축목표: shared.월저축목표,
      ...nicknamesToSettings(shared.닉네임 ?? {}),
      ...(shared.기념일 ? anniversariesToSettings(shared.기념일) : {}),
    },
    captures: [...captures.map(capture => ({ key: capture.key, status: capture.status })), ...[...skippedKeys].map(key => ({ key, status: '무시' }))],
    cycles,
  })

  // 전송 중 다시 수정된 항목은 outbox에 남겨 다음 동기화에 보낸다.
  await db.transaction('rw', [db.outbox, db.transactions, db.rules, db.shared, db.captures, db.cycles], async () => {
    const sentAt = new Map([...transactions, ...rules, ...cycles].map(item => ['id' in item ? item.id : item.keyword, item.updatedAt]))
    if (shared) sentAt.set('shared', shared.updatedAt)
    captures.forEach(capture => sentAt.set(capture.key, capture.updatedAt ?? ''))
    const current = await db.outbox.toArray()
    const doneIds = await Promise.all(
      current.map(async item => {
        if (item.type === 'skippedCapture') return skippedKeys.has(item.id) ? item.id : null
        if (item.type === 'cycle' && !response.acceptsCycles) return null
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

  // 수집함 반영이 실패하면 받은 시각도 남기지 않아서, 다음 동기화 때 다시 받는다.
  await db.transaction('rw', [db.transactions, db.rules, db.categories, db.meta, db.shared, db.captures, db.outbox, db.cycles], async () => {
    await db.transactions.bulkPut(response.transactions.filter(item => !pendingIds.has(item.id)))
    await db.cycles.bulkPut((response.cycles ?? []).filter(item => !pendingIds.has(item.id)))
    await db.rules.bulkPut(response.rules.filter(item => !pendingIds.has(item.keyword)))
    if (response.categories.length > 0) {
      await db.categories.clear()
      await db.categories.bulkPut(response.categories)
    }
    if (response.settings && !pendingIds.has('shared')) {
      await db.shared.put({
        key: 'shared',
        월예산: Number(response.settings.월예산) || 0,
        월저축목표: Number(response.settings.월저축목표) || 0,
        닉네임: nicknamesFromSettings(response.settings),
        기념일: anniversariesFromSettings(response.settings),
        updatedAt: response.serverTime,
      })
    }
    // 안드로이드 앱은 폰 알림에서 직접 모으므로, 아이폰 단축어가 보낸 문자는 받지 않는다.
    if (response.captures?.length && !isCaptureSupported()) await ingestSheetCaptures(response.captures, pendingIds)
    await db.meta.put({ key: 'sync', lastServerTime: response.serverTime, lastSyncedAt: new Date().toISOString() })
  })
}

let running: Promise<void> | null = null
let isRerunRequested = false

// 보내는 중에 생긴 변경은 이번 회차에 실리지 않으므로, 끝난 뒤 한 번 더 돈다.
export const syncNow = () => {
  if (!isSyncConfigured(getSettings())) return Promise.resolve()
  if (running) {
    isRerunRequested = true
    return running
  }
  running = (async () => {
    try {
      do {
        isRerunRequested = false
        await pushOutbox()
        await pullChanges()
      } while (isRerunRequested)
    } finally {
      running = null
    }
  })()
  return running
}

export const resetSync = async () => {
  await db.meta.delete('sync')
}
