import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CycleItem } from '../domain/cycle'
import { saveSettings } from '../sync/settings'
import { syncNow } from '../sync/sync'
import { deleteCycle, saveCycle } from './cycles'
import { db, type OutboxItem } from './database'

const input = (overrides: Partial<CycleItem> = {}) => ({
  name: '정수기 필터',
  icon: '💧',
  target: '공동' as const,
  keyword: '정수기',
  period: { amount: 6, unit: 'month' as const },
  memo: '',
  ...overrides,
})

let sheet: { cycles: Map<string, CycleItem & { syncedAt: string }> }
let pushed: { cycles: CycleItem[] }[]

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  sheet = { cycles: new Map() }
  pushed = []
  saveSettings({ endpoint: 'https://script.example/exec', token: 't', defaultPerson: '쿠리만쥬' })
  let clock = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL | string, init?: RequestInit) => {
      const serverTime = `2026-11-04T00:00:${String(clock++).padStart(2, '0')}.000Z`
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        if (body.action !== 'push') return Response.json({ ok: true })
        pushed.push({ cycles: body.cycles ?? [] })
        body.cycles?.forEach((item: CycleItem) => sheet.cycles.set(item.id, { ...item, syncedAt: serverTime }))
        return Response.json({ ok: true, serverTime, acceptsCycles: true })
      }
      const since = new URL(url).searchParams.get('since') ?? ''
      const newer = <T extends { syncedAt: string }>(rows: Map<string, T>) =>
        [...rows.values()].filter(row => row.syncedAt > since).map(row => ({ ...row, syncedAt: undefined }))
      return Response.json({ ok: true, serverTime, transactions: [], rules: [], categories: [], cycles: newer(sheet.cycles) })
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('주기 저장', () => {
  it('저장하면 바로 시트로 보낸다', async () => {
    await saveCycle(input())
    await vi.waitFor(() => expect(pushed).toHaveLength(1))
  })

  it('주기를 모르는 옛 서버로 보냈으면 주기 변경은 outbox에 남긴다', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') return Response.json({ ok: true, serverTime: '2026-11-04T00:00:00.000Z' })
      return Response.json({ ok: true, serverTime: '2026-11-04T00:00:00.000Z', transactions: [], rules: [], categories: [] })
    })
    const item = await saveCycle(input())
    await syncNow()

    expect(await db.outbox.get(item.id)).toMatchObject({ type: 'cycle' })
  })

  it('항목을 저장하면 일정 키워드까지 시트로 올리고 outbox를 비운다', async () => {
    const item = await saveCycle(input())
    await syncNow()

    expect(sheet.cycles.get(item.id)).toMatchObject({ name: '정수기 필터', keyword: '정수기', deleted: false })
    expect(await db.outbox.count()).toBe(0)
  })

  it('항목을 지우면 지운 표시로 올린다', async () => {
    const item = await saveCycle(input())
    await deleteCycle(item.id)
    await syncNow()

    expect(sheet.cycles.get(item.id)).toMatchObject({ deleted: true })
  })

  it('예전에 쌓인 주기 기록 outbox 항목은 보내지 않고 지운다', async () => {
    await db.outbox.put({ id: 'old-log', type: 'cycleLog' } as unknown as OutboxItem)
    await syncNow()

    expect(await db.outbox.count()).toBe(0)
  })

  it('보내는 중에 다시 고친 항목은 이어서 한 번 더 보낸다', async () => {
    const item = await saveCycle(input())
    await syncNow()
    const original = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementationOnce(async (url, init) => {
      // 같은 밀리초 안에 고치면 수정시각이 같아져 구분할 수 없으니 조금 기다린다.
      await new Promise(resolve => setTimeout(resolve, 5))
      await saveCycle(input({ name: '정수기 필터 (주방)' }), item.id)
      return original(url, init)
    })
    await saveCycle(input({ name: '정수기 필터 (거실)' }), item.id)
    await syncNow()

    expect(sheet.cycles.get(item.id)?.name).toBe('정수기 필터 (주방)')
    expect(await db.outbox.count()).toBe(0)
  })
})
