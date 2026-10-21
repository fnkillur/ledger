import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { bootstrap } from './bootstrap'
import './index.css'
import AppLockGate from './lock/AppLockGate'
import { router } from './router'

bootstrap()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppLockGate>
      <RouterProvider router={router} />
    </AppLockGate>
  </StrictMode>,
)
