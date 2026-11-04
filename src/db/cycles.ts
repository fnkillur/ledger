import type { CycleInput, CycleItem, CycleLog } from '../domain/cycle'
import type { Person } from '../domain/types'
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
  const updatedAt = now()
  await db.transaction('rw', db.cycles, db.cycleLogs, db.outbox, async () => {
    await db.cycles.update(id, { deleted: true, updatedAt })
    await db.outbox.put({ id, type: 'cycle' })
    const logs = await db.cycleLogs.where('cycleId').equals(id).filter(log => !log.deleted).toArray()
    await db.cycleLogs.bulkPut(logs.map(log => ({ ...log, deleted: true, updatedAt })))
    await db.outbox.bulkPut(logs.map(log => ({ id: log.id, type: 'cycleLog' as const })))
  })
  sendSoon()
}

export const logCycle = async (cycleId: string, date: string, person: Person) => {
  const log: CycleLog = { id: crypto.randomUUID(), cycleId, date, person, deleted: false, updatedAt: now() }
  await db.transaction('rw', db.cycleLogs, db.outbox, async () => {
    await db.cycleLogs.put(log)
    await db.outbox.put({ id: log.id, type: 'cycleLog' })
  })
  sendSoon()
  return log
}

const changeLog = async (id: string, changes: Partial<CycleLog>) => {
  await db.transaction('rw', db.cycleLogs, db.outbox, async () => {
    await db.cycleLogs.update(id, { ...changes, updatedAt: now() })
    await db.outbox.put({ id, type: 'cycleLog' })
  })
  sendSoon()
}

export const updateCycleLog = (id: string, date: string) => changeLog(id, { date })

export const deleteCycleLog = (id: string) => changeLog(id, { deleted: true })
