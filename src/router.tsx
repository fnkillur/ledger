import { createHashRouter } from 'react-router'
import TabLayout from './components/TabLayout'
import EditPage from './pages/EditPage'
import ImportCapturePage from './pages/ImportCapturePage'
import InboxPage from './pages/InboxPage'
import ListPage from './pages/ListPage'
import MonthlyPage from './pages/MonthlyPage'
import NotFoundPage from './pages/NotFoundPage'
import SettingsPage from './pages/SettingsPage'
import StatsPage from './pages/StatsPage'

export const router = createHashRouter([
  {
    element: <TabLayout />,
    children: [
      { path: '/', element: <ListPage /> },
      { path: '/stats', element: <StatsPage /> },
      { path: '/inbox', element: <InboxPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '/tx/new', element: <EditPage /> },
  { path: '/tx/:id', element: <EditPage /> },
  { path: '/monthly', element: <MonthlyPage /> },
  { path: '/import', element: <ImportCapturePage /> },
  { path: '*', element: <NotFoundPage /> },
])
