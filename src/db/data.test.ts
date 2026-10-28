import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CapturedNotification } from '../domain/notificationParser'
import type { Transaction } from '../domain/types'
import { saveSettings } from '../sync/settings'
import { syncNow } from '../sync/sync'
import { ingestCaptures } from './captures'
import { db } from './database'
import { deleteTransaction, saveMonthlyTotals, saveTransaction, splitTransaction, type TransactionInput } from './repository'
import { DEFAULT_CATEGORIES } from '../domain/defaultCategories'

const input = (overrides: Partial<TransactionInput> = {}): TransactionInput => ({
  occurredAt: '2026-10-21T03:00:00.000Z',
  person: '쿠리만쥬',
  kind: '지출',
  amount: 10000,
  shareCount: 1,
  merchant: '가게',
  category: '식비',
  excluded: false,
  source: '수동',
  memo: '',
  rawText: '',
  scope: '공동',
  ...overrides,
})

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
})

describe('repository', () => {
  it('저장하면 outbox에 올라가고 삭제는 소프트 삭제다', async () => {
    const saved = await saveTransaction(input())
    await deleteTransaction(saved.id)

    expect((await db.transactions.get(saved.id))?.deleted).toBe(true)
    expect(await db.outbox.toArray()).toEqual([{ id: saved.id, type: 'transaction' }])
  })

  it('거래를 나누면 원래 금액에서 빼고 새 거래를 만든다', async () => {
    const salary = await saveTransaction(input({ kind: '수입', category: '월급', amount: 5616746 }))
    await splitTransaction(salary, 113766, '은행이자지원')

    const all = await db.transactions.toArray()
    expect(all.map(item => [item.category, item.amount]).sort()).toEqual([
      ['월급', 5502980],
      ['은행이자지원', 113766],
    ])
  })
})

describe('saveMonthlyTotals', () => {
  it('같은 달·사람을 다시 저장하면 덮어쓰고 빠진 카테고리는 지우며, 개인 기본값을 따른다', async () => {
    await saveMonthlyTotals('2026-10', '우사기', [
      { category: '식비', amount: 100000 },
      { category: '미용', amount: 50000 },
      { category: '월급', amount: 4000000 },
    ], DEFAULT_CATEGORIES)
    await saveMonthlyTotals('2026-10', '우사기', [
      { category: '식비', amount: 120000 },
      { category: '월급', amount: 4000000 },
    ], DEFAULT_CATEGORIES)
    await saveMonthlyTotals('2026-10', '쿠리만쥬', [{ category: '식비', amount: 1 }], DEFAULT_CATEGORIES)

    const rows = await db.transactions.where('id').startsWith('monthly-2026-10-우사기-').toArray()
    const byCategory = Object.fromEntries(rows.map(row => [row.category, row]))
    expect(byCategory['식비']).toMatchObject({ amount: 120000, deleted: false, source: '월합계', scope: '공동', kind: '지출' })
    expect(byCategory['미용']).toMatchObject({ deleted: true, scope: '개인' })
    expect(byCategory['월급']).toMatchObject({ kind: '수입', deleted: false })
    expect(await db.transactions.where('id').startsWith('monthly-2026-10-쿠리만쥬-').count()).toBe(1)
  })
})

const capture = (key: string, text: string, minute: number): CapturedNotification => ({
  key,
  packageName: 'com.example',
  appLabel: '예시',
  title: '결제',
  text,
  postedAt: Date.parse(`2026-10-21T03:${String(minute).padStart(2, '0')}:00.000Z`),
})

describe('ingestCaptures', () => {
  it('결제 알림만 받고, 2분 안의 같은 금액은 중복으로 표시하며, 같은 키는 다시 받지 않는다', async () => {
    const added = await ingestCaptures([
      capture('a', '스타벅스에서 5,300원 결제', 0),
      capture('b', '[카드] 5,300원 승인', 1),
      capture('c', '광고: 5,000원 쿠폰', 2),
      capture('d', '편의점에서 2,000원 결제', 3),
    ])
    await ingestCaptures([capture('a', '스타벅스에서 5,300원 결제', 0)])

    const items = await db.captures.orderBy('postedAt').toArray()
    expect(added).toBe(2)
    expect(items.map(item => [item.key, item.status])).toEqual([
      ['a', '대기'],
      ['b', '중복'],
      ['d', '대기'],
    ])
  })

  it('이미 기록된 거래와 같은 알림도 중복으로 본다', async () => {
    await saveTransaction(input({ amount: 5300, occurredAt: '2026-10-21T03:00:00.000Z' }))

    await ingestCaptures([capture('x', '스타벅스에서 5,300원 결제', 1)])

    expect((await db.captures.get('x'))?.status).toBe('중복')
  })
})

describe('syncNow', () => {
  let sheet: Map<string, Transaction & { syncedAt: string }>

  beforeEach(() => {
    sheet = new Map()
    saveSettings({ endpoint: 'https://script.example/exec', token: 't', defaultPerson: '쿠리만쥬' })
    let clock = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL | string, init?: RequestInit) => {
        const serverTime = `2026-10-21T00:00:${String(clock++).padStart(2, '0')}.000Z`
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body))
          body.transactions.forEach((item: Transaction) => sheet.set(item.id, { ...item, syncedAt: serverTime }))
          return Response.json({ ok: true, serverTime })
        }
        const since = new URL(url).searchParams.get('since') ?? ''
        const transactions = [...sheet.values()].filter(item => item.syncedAt > since).map(item => ({ ...item, syncedAt: undefined }))
        return Response.json({ ok: true, serverTime, transactions, rules: [], categories: [] })
      }),
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  it('outbox를 올리고 비운 뒤, 다른 기기에서 생긴 변경을 받아온다', async () => {
    const mine = await saveTransaction(input())
    await syncNow()

    expect(sheet.has(mine.id)).toBe(true)
    expect(await db.outbox.count()).toBe(0)

    const fromOther = { ...mine, id: 'other', merchant: '다른 기기', syncedAt: '2026-10-21T00:00:59.000Z' }
    sheet.set('other', fromOther)
    await syncNow()

    expect((await db.transactions.get('other'))?.merchant).toBe('다른 기기')
  })
})

describe('시트 수집함', () => {
  type Row = { key: string; receivedAt: string; person: string; text: string; status: string; syncedAt: string }
  let rows: Row[]
  let pushedCaptures: { key: string; status: string }[]

  beforeEach(() => {
    pushedCaptures = []
    rows = [
      {
        key: 'sms-1',
        receivedAt: '2026-10-22T03:30:00.000Z',
        person: '우사기',
        text: '[Web발신]\n삼성3975승인 박*윤\n6,500원 일시불\n10/22 12:30 스타벅스\n누적2,330,350원',
        status: '대기',
        syncedAt: '2026-10-22T03:30:00.000Z',
      },
    ]
    saveSettings({ endpoint: 'https://script.example/exec', token: 't', defaultPerson: '쿠리만쥬' })
    let clock = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL | string, init?: RequestInit) => {
        const serverTime = `2026-10-23T00:00:${String(clock++).padStart(2, '0')}.000Z`
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body))
          pushedCaptures.push(...(body.captures ?? []))
          return Response.json({ ok: true, serverTime })
        }
        const since = new URL(url).searchParams.get('since') ?? ''
        const captures = rows.filter(row => row.syncedAt > since)
        return Response.json({ ok: true, serverTime, transactions: [], rules: [], categories: [], captures })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('../native/notificationCapture')
  })

  it('단축어가 보낸 문자를 수집함에 넣고, 기록하면 처리 상태를 시트로 돌려보낸다', async () => {
    const { markCapture } = await import('./captures')
    await syncNow()

    const capture = await db.captures.get('sms-1')
    expect(capture).toMatchObject({ status: '대기', fromSheet: true, person: '우사기', parsed: { amount: 6500, merchant: '스타벅스' } })
    expect(new Date(capture!.parsed.occurredAt).getHours()).toBe(12)

    await markCapture('sms-1', '기록됨')
    await syncNow()

    expect(pushedCaptures).toEqual([{ key: 'sms-1', status: '기록됨' }])
    expect(await db.outbox.count()).toBe(0)
  })

  it('결제 문자가 아니라서 걸러 낸 문자는 수집함에 넣지 않고, 시트에는 무시로 돌려보낸다', async () => {
    rows.push({ key: 'sms-2', receivedAt: '2026-10-22T04:00:00.000Z', person: '우사기', text: '[Web발신] 로그인 승인 요청이 있어요', status: '대기', syncedAt: '2026-10-22T04:00:00.000Z' })
    await syncNow()

    expect(await db.captures.get('sms-2')).toBeUndefined()
    expect(await db.outbox.get('sms-2')).toMatchObject({ type: 'skippedCapture' })

    await syncNow()

    expect(pushedCaptures).toEqual([{ key: 'sms-2', status: '무시' }])
    expect(await db.outbox.count()).toBe(0)
  })

  it('다른 기기에서 이미 처리한 문자는 상태만 맞춘다', async () => {
    await syncNow()
    rows[0] = { ...rows[0], status: '무시', syncedAt: '2026-10-23T00:01:00.000Z' }
    await syncNow()

    expect((await db.captures.get('sms-1'))?.status).toBe('무시')
  })

  it('알림을 직접 모으는 안드로이드 앱은 시트 수집함을 받지 않는다', async () => {
    vi.resetModules()
    vi.doMock('../native/notificationCapture', async original => ({
      ...(await original<typeof import('../native/notificationCapture')>()),
      isCaptureSupported: () => true,
    }))
    const { syncNow: syncOnAndroid } = await import('../sync/sync')
    const { db: androidDb } = await import('./database')
    await syncOnAndroid()

    expect(await androidDb.captures.count()).toBe(0)
  })
})
