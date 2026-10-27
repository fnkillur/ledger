import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import { bootstrap, hideBootSplash } from './bootstrap'
import { syncCalendar } from './db/calendar'
import CelebrationLayer from './celebration/CelebrationLayer'
import './index.css'
import AppLockGate from './lock/AppLockGate'
import { listenNativePush } from './push/push'
import { router } from './router'

bootstrap()
hideBootSplash()
listenNativePush(date => router.navigate(`/?date=${date}`), () => syncCalendar())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppLockGate>
      <RouterProvider router={router} />
      <CelebrationLayer />
    </AppLockGate>
  </StrictMode>,
)
