import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { saveSharedSettings, updateSharedSettings } from '../db/repository'
import { pull, push } from './api'
import { syncNow } from './sync'

vi.mock('./api', () => ({ pull: vi.fn(), push: vi.fn() }))
vi.mock('./settings', () => ({ getSettings: () => ({ endpoint: 'https://example.test/exec', token: 'test-token' }), isSyncConfigured: () => true }))
vi.mock('../native/notificationCapture', () => ({ isCaptureSupported: () => false }))

const emptyPull = (settings: Record<string, unknown>) => ({ transactions: [], rules: [], categories: [], cycles: [], captures: [], settings, serverTime: '2026-11-11T00:00:00.000Z' })

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  vi.mocked(push).mockReset().mockResolvedValue({ serverTime: '2026-11-11T00:00:00.000Z', acceptsCycles: true })
  vi.mocked(pull).mockReset().mockResolvedValue(emptyPull({}))
})

describe('공유 설정 동기화', () => {
  it('사귄 날·결혼한 날을 닉네임·예산과 함께 숫자로 보낸다', async () => {
    await saveSharedSettings({ 월예산: 0, 월저축목표: 0, 기념일: { 사귄날: '2019-01-02', 결혼한날: '2023-04-05' } })

    await syncNow()

    expect(vi.mocked(push).mock.calls[0][1].settings).toMatchObject({ 월예산: 0, 사귄날: 20190102, 결혼한날: 20230405 })
  })

  it('닉네임만 바꿔도 이미 넣은 사귄 날·결혼한 날과 예산은 그대로 남는다', async () => {
    await saveSharedSettings({ 월예산: 500000, 월저축목표: 0, 기념일: { 사귄날: '2019-01-02', 결혼한날: '2023-04-05' } })

    await updateSharedSettings({ 닉네임: { 우사기: '토끼' } })

    expect(await db.shared.get('shared')).toMatchObject({ 월예산: 500000, 닉네임: { 우사기: '토끼' }, 기념일: { 사귄날: '2019-01-02' } })
    expect(await db.outbox.get('shared')).toBeDefined()
  })

  it('시트에서 받은 사귄 날·결혼한 날을 저장한다', async () => {
    vi.mocked(pull).mockResolvedValue(emptyPull({ 월예산: 0, 월저축목표: 0, 사귄날: 20190102, 결혼한날: 20230405 }))

    await syncNow()

    expect((await db.shared.get('shared'))?.기념일).toEqual({ 사귄날: '2019-01-02', 결혼한날: '2023-04-05' })
  })
})
