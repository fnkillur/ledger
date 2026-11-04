import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { backAction, runBackHandler } from '../navigation/back'
import ScrollManager from './ScrollManager'

function RootLayout() {
  useAndroidBackButton()

  return <ScrollManager />
}

// 안드로이드 뒤로가기를 직접 받아, 열린 시트를 먼저 닫고 탭 이동은 이력 대신 정해진 규칙을 따른다.
function useAndroidBackButton() {
  const location = useLocation()
  const navigate = useNavigate()

  const path = useRef(location.pathname)

  useEffect(() => {
    path.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = App.addListener('backButton', ({ canGoBack }) => {
      if (runBackHandler()) return
      const action = backAction(path.current, canGoBack)
      if (action === 'exit') App.exitApp()
      if (action === 'home') navigate('/', { replace: true })
      if (action === 'back') navigate(-1)
    })
    return () => {
      listener.then(handle => handle.remove())
    }
  }, [navigate])
}

export default RootLayout
