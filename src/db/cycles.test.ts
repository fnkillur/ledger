import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cycleState, type CycleItem, type CycleLog } from '../domain/cycle'
import { saveSettings } from '../sync/settings'
import { syncNow } from '../sync/sync'
import { deleteCycle, deleteCycleLog, logCycle, saveCycle, updateCycleLog } from './cycles'
import { db } from './database'

const input = (overrides: Partial<CycleItem> = {}) => ({
  name: '정수기 필터',
  icon: '💧',
  target: '공동' as const,
  period: { amount: 6, unit: 'month' as const },
  link: null,
  notify: { enabled: true, offsets: [0, 3], afterDays: null },
  memo: '',
  ...overrides,
})

let sheet: { cycles: Map<string, CycleItem & { syncedAt: string }>; cycleLogs: Map<string, CycleLog & { syncedAt: string }> }
let pushed: { cycles: CycleItem[]; cycleLogs: CycleLog[] }[]

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  sheet = { cycles: new Map(), cycleLogs: new Map() }
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
        pushed.push({ cycles: body.cycles ?? [], cycleLogs: body.cycleLogs ?? [] })
        body.cycles?.forEach((item: CycleItem) => sheet.cycles.set(item.id, { ...item, syncedAt: serverTime }))
        body.cycleLogs?.forEach((log: CycleLog) => sheet.cycleLogs.set(log.id, { ...log, syncedAt: serverTime }))
        return Response.json({ ok: true, serverTime, acceptsCycles: true })
      }
      const since = new URL(url).searchParams.get('since') ?? ''
      const newer = <T extends { syncedAt: string }>(rows: Map<string, T>) =>
        [...rows.values()].filter(row => row.syncedAt > since).map(row => ({ ...row, syncedAt: undefined }))
      return Response.json({ ok: true, serverTime, transactions: [], rules: [], categories: [], cycles: newer(sheet.cycles), cycleLogs: newer(sheet.cycleLogs) })
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

  it('항목과 기록을 저장하면 시트로 올리고 outbox를 비운다', async () => {
    const item = await saveCycle(input())
    const log = await logCycle(item.id, '2026-11-01', '우사기')
    await syncNow()

    expect(sheet.cycles.get(item.id)).toMatchObject({ name: '정수기 필터', deleted: false })
    expect(sheet.cycleLogs.get(log.id)).toMatchObject({ cycleId: item.id, date: '2026-11-01', person: '우사기' })
    expect(await db.outbox.count()).toBe(0)
  })

  it('기록 날짜를 고치거나 지우면 다시 올린다', async () => {
    const item = await saveCycle(input())
    const log = await logCycle(item.id, '2026-11-01', '우사기')
    await updateCycleLog(log.id, '2026-10-30')
    expect((await db.cycleLogs.get(log.id))?.date).toBe('2026-10-30')

    await deleteCycleLog(log.id)
    await syncNow()
    expect(sheet.cycleLogs.get(log.id)).toMatchObject({ date: '2026-10-30', deleted: true })
  })

  it('항목을 지우면 그 항목의 기록도 함께 지운다', async () => {
    const item = await saveCycle(input())
    const log = await logCycle(item.id, '2026-11-01', '우사기')
    await deleteCycle(item.id)

    expect((await db.cycles.get(item.id))?.deleted).toBe(true)
    expect((await db.cycleLogs.get(log.id))?.deleted).toBe(true)
  })

  it('다른 기기에서 지운 기록을 받으면 마지막 날이 이전 기록으로 돌아간다', async () => {
    const item = await saveCycle(input())
    await logCycle(item.id, '2026-09-01', '우사기')
    const latest = await logCycle(item.id, '2026-10-01', '우사기')
    await syncNow()

    sheet.cycleLogs.set(latest.id, { ...latest, deleted: true, updatedAt: '2026-11-04T01:00:00.000Z', syncedAt: '2026-11-04T00:59:00.000Z' })
    await syncNow()

    const logs = await db.cycleLogs.toArray()
    expect(cycleState((await db.cycles.get(item.id))!, logs, [], '2026-11-04').lastDate).toBe('2026-09-01')
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
