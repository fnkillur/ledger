import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it, vi } from 'vitest'

describe('저장소 업그레이드', () => {
  it('일정 키워드가 생기기 전에 받아 둔 주기 항목은 빈 키워드로 채운다', async () => {
    const old = new Dexie('ledger')
    old.version(7).stores({ cycles: 'id' })
    await old.open()
    await old.table('cycles').put({ id: 'c1', name: '치과', target: '우사기', deleted: false })
    old.close()

    vi.resetModules()
    const { db } = await import('./database')
    expect((await db.cycles.get('c1'))?.keyword).toBe('')
    expect((await db.cycles.get('c1'))?.anchor).toBeNull()
  })
})
