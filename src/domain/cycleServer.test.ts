import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import type { CycleItem, CycleLog } from './cycle'
import type { Transaction } from './types'
import cases from './cycleCases.json'

type Case = { name: string; item: CycleItem; logs: CycleLog[]; transactions: Transaction[]; today: string; expected: Record<string, unknown> }

// 시트·구글 서비스를 부르지 않는 순수 함수만 꺼내 쓴다. 앱과 같은 사례로 계산이 같은지 본다.
const loadServer = () => {
  const context: Record<string, unknown> = {}
  runInNewContext(`${readFileSync(resolve(__dirname, '../../apps-script/Cycle.gs'), 'utf8')}
    this.server = { cycleReminders_, cycleState_, dueOffsetToday_, toCycleRow_, fromCycleRow_, toCycleLogRow_, fromCycleLogRow_, CYCLE_COLUMNS, CYCLE_LOG_COLUMNS }`, context)
  return context.server as Record<string, (...args: unknown[]) => unknown> & { CYCLE_COLUMNS: string[]; CYCLE_LOG_COLUMNS: string[] }
}

const server = loadServer()

const toObject = (columns: string[], row: unknown[]) => Object.fromEntries(columns.map((column, index) => [column, row[index]]))

describe('Cycle.gs 계산 (앱과 공통 사례)', () => {
  ;(cases as unknown as Case[]).forEach(testCase => {
    it(testCase.name, () => {
      const state = server.cycleState_(testCase.item, testCase.logs, testCase.transactions, testCase.today) as Record<string, unknown>
      expect({
        lastDate: state.lastDate,
        lastSource: state.lastSource,
        nextDate: state.nextDate,
        days: state.days,
        dueOffset: server.dueOffsetToday_(testCase.item, state),
      }).toEqual(testCase.expected)
    })
  })
})

describe('Cycle.gs 시트 행', () => {
  it('주기 항목은 행으로 바꿨다가 그대로 되돌린다', () => {
    const item: CycleItem = {
      id: 'c1',
      name: '정수기 필터',
      icon: '💧',
      target: '공동',
      period: { amount: 6, unit: 'month' },
      link: { category: '', keyword: '치과', person: '우사기' },
      notify: { enabled: true, offsets: [0, 3], afterDays: null },
      memo: '',
      deleted: false,
      updatedAt: '2026-11-04T00:00:00.000Z',
    }
    const row = server.toCycleRow_(item, '2026-11-04T01:00:00.000Z') as unknown[]
    expect(row.at(-1)).toBe('2026-11-04T01:00:00.000Z')
    expect(server.fromCycleRow_(toObject(server.CYCLE_COLUMNS, row))).toEqual(item)
  })

  it('주기·연결·알림이 없는 항목도 되돌린다', () => {
    const item: CycleItem = {
      id: 'c2',
      name: '치과',
      icon: '',
      target: '우사기',
      period: null,
      link: null,
      notify: { enabled: false, offsets: [], afterDays: null },
      memo: '메모',
      deleted: true,
      updatedAt: '2026-11-04T00:00:00.000Z',
    }
    expect(server.fromCycleRow_(toObject(server.CYCLE_COLUMNS, server.toCycleRow_(item, 'now') as unknown[]))).toEqual(item)
  })

  it('기록 행도 되돌린다', () => {
    const log: CycleLog = { id: 'l1', cycleId: 'c1', date: '2026-11-04', person: '쿠리만쥬', deleted: false, updatedAt: '2026-11-04T00:00:00.000Z' }
    expect(server.fromCycleLogRow_(toObject(server.CYCLE_LOG_COLUMNS, server.toCycleLogRow_(log, 'now') as unknown[]))).toEqual(log)
  })
})

describe('Cycle.gs 알림 고르기', () => {
  const item = (overrides: Partial<CycleItem>): CycleItem => ({
    id: 'c1',
    name: '정수기 필터',
    icon: '',
    target: '공동',
    period: { amount: 1, unit: 'year' },
    link: null,
    notify: { enabled: true, offsets: [0, 3], afterDays: null },
    memo: '',
    deleted: false,
    updatedAt: '',
    ...overrides,
  })
  const log = (cycleId: string, date: string): CycleLog => ({ id: `${cycleId}-${date}`, cycleId, date, person: '쿠리만쥬', deleted: false, updatedAt: '' })
  const remind = (items: CycleItem[], logs: CycleLog[], sentKeys: string[] = []) =>
    server.cycleReminders_(items, logs, [], '2026-11-04', sentKeys) as { people: string[]; title: string; link: string; key: string }[]

  it('공동 항목은 두 사람에게, 개인 항목은 그 사람에게 보낸다', () => {
    const messages = remind([item({ id: 'shared' }), item({ id: 'mine', name: '치과', target: '우사기' })], [log('shared', '2025-11-07'), log('mine', '2025-11-04')])
    expect(messages.map(message => [message.key, message.people])).toEqual([
      ['shared|2025-11-07|3', ['쿠리만쥬', '우사기']],
      ['mine|2025-11-04|0', ['우사기']],
    ])
  })

  it('문구는 남은 날·당일·지난 날에 맞춘다', () => {
    const messages = remind(
      [item({ id: 'a' }), item({ id: 'b', name: '칫솔' }), item({ id: 'c', name: '미용실', period: null, notify: { enabled: true, offsets: [], afterDays: 60 } })],
      [log('a', '2025-11-07'), log('b', '2025-11-04'), log('c', '2026-09-05')],
    )
    expect(messages.map(message => message.title)).toEqual(['정수기 필터 3일 남았어요', '오늘 칫솔 하는 날이에요', '미용실 60일 지났어요'])
    expect(messages[0].link).toBe('/cycles?id=a')
  })

  it('이미 보낸 알림은 다시 보내지 않지만, 마지막 날이 바뀐 새 주기는 보낸다', () => {
    expect(remind([item({})], [log('c1', '2025-11-07')], ['c1|2025-11-07|3'])).toEqual([])
    expect(remind([item({ period: { amount: 3, unit: 'day' } })], [log('c1', '2026-11-04')], ['c1|2025-11-07|3'])).toHaveLength(1)
  })

  it('지운 항목·알림 끈 항목·기한 지난 항목은 보내지 않는다', () => {
    expect(
      remind(
        [item({ id: 'gone', deleted: true }), item({ id: 'off', notify: { enabled: false, offsets: [3], afterDays: null } }), item({ id: 'late', period: { amount: 1, unit: 'month' } })],
        [log('gone', '2025-11-07'), log('off', '2025-11-07'), log('late', '2026-09-01')],
      ),
    ).toEqual([])
  })
})

describe('Apps Script 설정', () => {
  it('트리거를 걸 수 있게 script.scriptapp 권한을 요청한다', () => {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../apps-script/appsscript.json'), 'utf8'))
    expect(manifest.oauthScopes).toContain('https://www.googleapis.com/auth/script.scriptapp')
  })

  it('사람이 쓰는 글자 열은 시트가 숫자·날짜·수식으로 바꾸지 않게 텍스트 서식을 건다', () => {
    const calls: { name: string; textColumns: string[] }[] = []
    const context: Record<string, unknown> = {
      SHEETS: { cycles: '주기항목', cycleLogs: '주기기록' },
      ensureSheet_: (_book: unknown, name: string, _columns: string[], textColumns: string[]) => calls.push({ name, textColumns }),
    }
    runInNewContext(`${readFileSync(resolve(__dirname, '../../apps-script/Cycle.gs'), 'utf8')}\n cycleSheets_({})`, context)
    expect(calls[0].textColumns).toEqual(expect.arrayContaining(['이름', '아이콘', '연결가맹점', '메모', '알림시점']))
  })
})
