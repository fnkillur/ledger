import { useEffect, useRef } from 'react'
import { LIST_PATH } from '../paths'

const HOME_PATHS = ['/', '/cycles']
const TAB_PATHS = [...HOME_PATHS, LIST_PATH, '/stats', '/inbox', '/settings']

// 안드로이드 뒤로가기: 폼·상세는 이전 화면, 다른 탭은 캘린더, 캘린더에서는 앱을 나간다.
export const backAction = (path: string, canGoBack: boolean) => {
  if (HOME_PATHS.includes(path)) return 'exit'
  if (TAB_PATHS.includes(path) || !canGoBack) return 'home'
  return 'back'
}

const handlers: (() => void)[] = []

// 열린 시트가 뒤로가기를 먼저 받아 스스로 닫는다. 나중에 열린 것이 먼저다.
export const pushBackHandler = (handler: () => void) => {
  handlers.push(handler)
  return () => {
    const index = handlers.lastIndexOf(handler)
    if (index >= 0) handlers.splice(index, 1)
  }
}

export const runBackHandler = () => {
  const handler = handlers.at(-1)
  if (!handler) return false
  handler()
  return true
}

// isActive가 꺼져 있으면(닫힌 메뉴 등) 뒤로가기를 가로채지 않는다.
export function useBackHandler(onBack: () => void, isActive = true) {
  const latest = useRef(onBack)

  useEffect(() => {
    latest.current = onBack
  })

  useEffect(() => {
    if (!isActive) return
    return pushBackHandler(() => latest.current())
  }, [isActive])
}
