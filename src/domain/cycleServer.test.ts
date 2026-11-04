import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import type { CycleItem } from './cycle'

// 시트·구글 서비스를 부르지 않는 순수 함수만 꺼내 쓴다.
const loadServer = () => {
  const context: Record<string, unknown> = {}
  runInNewContext(`${readFileSync(resolve(__dirname, '../../apps-script/Cycle.gs'), 'utf8')}
    this.server = { toCycleRow_, fromCycleRow_, CYCLE_COLUMNS }`, context)
  return context.server as Record<string, (...args: unknown[]) => unknown> & { CYCLE_COLUMNS: string[] }
}

const server = loadServer()

const toObject = (columns: string[], row: unknown[]) => Object.fromEntries(columns.map((column, index) => [column, row[index]]))

describe('Cycle.gs 시트 행', () => {
  it('주기 항목은 행으로 바꿨다가 그대로 되돌린다', () => {
    const item: CycleItem = {
      id: 'c1',
      name: '정수기 필터',
      icon: '💧',
      target: '공동',
      keyword: '정수기',
      period: { amount: 6, unit: 'month' },
      memo: '',
      deleted: false,
      updatedAt: '2026-11-04T00:00:00.000Z',
    }
    const row = server.toCycleRow_(item, '2026-11-04T01:00:00.000Z') as unknown[]
    expect(row[server.CYCLE_COLUMNS.indexOf('동기화시각')]).toBe('2026-11-04T01:00:00.000Z')
    expect(server.fromCycleRow_(toObject(server.CYCLE_COLUMNS, row))).toEqual(item)
  })

  it('주기·연결·알림이 없는 항목도 되돌린다', () => {
    const item: CycleItem = {
      id: 'c2',
      name: '치과',
      icon: '',
      target: '우사기',
      keyword: '',
      period: null,
      memo: '메모',
      deleted: true,
      updatedAt: '2026-11-04T00:00:00.000Z',
    }
    expect(server.fromCycleRow_(toObject(server.CYCLE_COLUMNS, server.toCycleRow_(item, 'now') as unknown[]))).toEqual(item)
  })

  it('쓰지 않게 된 알림 열도 비워 둔다', () => {
    const row = server.toCycleRow_({ id: 'c5', name: '치과', icon: '', target: '공동', keyword: '', period: null, memo: '', deleted: false, updatedAt: 'u' }, 'now') as unknown[]
    expect(['알림', '알림시점', '경과알림일'].map(column => row[server.CYCLE_COLUMNS.indexOf(column)])).toEqual(['', '', ''])
  })

  it('쓰지 않게 된 결제 연결 열은 비워 둔다', () => {
    const row = server.toCycleRow_({ id: 'c4', name: '치과', icon: '', target: '공동', keyword: '', period: null, memo: '', deleted: false, updatedAt: 'u' }, 'now') as unknown[]
    expect(['연결카테고리', '연결가맹점', '연결사람'].map(column => row[server.CYCLE_COLUMNS.indexOf(column)])).toEqual(['', '', ''])
  })

  it('일정키워드 열이 없던 옛 행은 빈 키워드로 읽는다', () => {
    const columns = server.CYCLE_COLUMNS.filter(column => column !== '일정키워드')
    const row = (server.toCycleRow_({ id: 'c3', name: '치과', icon: '', target: '공동', keyword: '', period: null, memo: '', deleted: false, updatedAt: 'u' }, 'now') as unknown[]).slice(0, columns.length)
    expect((server.fromCycleRow_(toObject(columns, row)) as CycleItem).keyword).toBe('')
  })
})

describe('Apps Script 설정', () => {
  it('예전에 건 알림 트리거를 지울 수 있게 script.scriptapp 권한을 요청한다', () => {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../apps-script/appsscript.json'), 'utf8'))
    expect(manifest.oauthScopes).toContain('https://www.googleapis.com/auth/script.scriptapp')
  })

  it('사람이 쓰는 글자 열은 시트가 숫자·날짜·수식으로 바꾸지 않게 텍스트 서식을 건다', () => {
    const calls: { name: string; textColumns: string[] }[] = []
    const context: Record<string, unknown> = {
      SHEETS: { cycles: '주기항목' },
      ensureSheet_: (_book: unknown, name: string, columns: string[], textColumns: string[]) => {
        calls.push({ name, textColumns })
        return { getLastColumn: () => columns.length, getRange: () => ({ getValues: () => [columns] }) }
      },
    }
    runInNewContext(`${readFileSync(resolve(__dirname, '../../apps-script/Cycle.gs'), 'utf8')}\n cycleSheet_({})`, context)
    expect(calls[0].textColumns).toEqual(expect.arrayContaining(['이름', '아이콘', '메모', '일정키워드']))
  })
})
