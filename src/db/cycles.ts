import type { CycleInput, CycleItem } from '../domain/cycle'
import { syncNow } from '../sync/sync'
import { db } from './database'

const now = () => new Date().toISOString()

// 알림 서버가 아침에 시트 기준으로 계산하므로, 바꾼 즉시 올려 둔다.
const sendSoon = () => {
  syncNow().catch(() => {})
}

export const saveCycle = async (input: CycleInput, id?: string) => {
  const item: CycleItem = { ...input, id: id ?? crypto.randomUUID(), deleted: false, updatedAt: now() }
  await db.transaction('rw', db.cycles, db.outbox, async () => {
    await db.cycles.put(item)
    await db.outbox.put({ id: item.id, type: 'cycle' })
  })
  sendSoon()
  return item
}

export const deleteCycle = async (id: string) => {
  await db.transaction('rw', db.cycles, db.outbox, async () => {
    await db.cycles.update(id, { deleted: true, updatedAt: now() })
    await db.outbox.put({ id, type: 'cycle' })
  })
  sendSoon()
}
