import { createHashRouter } from 'react-router'
import TabLayout from './components/TabLayout'
import EditPage from './pages/EditPage'
import InboxPage from './pages/InboxPage'
import ListPage from './pages/ListPage'
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
  { path: '*', element: <NotFoundPage /> },
])
