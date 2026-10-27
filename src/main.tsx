import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import { bootstrap, hideBootSplash } from './bootstrap'
import CelebrationLayer from './celebration/CelebrationLayer'
import './index.css'
import AppLockGate from './lock/AppLockGate'
import { router } from './router'

bootstrap()
hideBootSplash()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppLockGate>
      <RouterProvider router={router} />
      <CelebrationLayer />
    </AppLockGate>
  </StrictMode>,
)
