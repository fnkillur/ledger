import { describe, expect, it, vi } from 'vitest'
import { backAction, pushBackHandler, runBackHandler } from './back'

describe('backAction', () => {
  it('폼·상세 화면은 이전 화면으로, 이력이 없으면 캘린더로 간다', () => {
    expect(backAction('/tx/new', true)).toBe('back')
    expect(backAction('/cycles/abc', false)).toBe('home')
  })

  it('캘린더가 아닌 탭은 캘린더로, 캘린더(일정·주기)는 앱을 나간다', () => {
    expect(backAction('/list', true)).toBe('home')
    expect(backAction('/settings', false)).toBe('home')
    expect(backAction('/', true)).toBe('exit')
    expect(backAction('/cycles', false)).toBe('exit')
  })
})

describe('runBackHandler', () => {
  it('가장 나중에 열린 시트부터 닫고, 열린 시트가 없으면 처리하지 않았다고 한다', () => {
    const closeSheet = vi.fn()
    const closeConfirm = vi.fn()
    const removeSheet = pushBackHandler(closeSheet)
    const removeConfirm = pushBackHandler(closeConfirm)

    expect(runBackHandler()).toBe(true)
    expect(closeConfirm).toHaveBeenCalledOnce()
    expect(closeSheet).not.toHaveBeenCalled()

    removeConfirm()
    removeSheet()
    expect(runBackHandler()).toBe(false)
  })
})
