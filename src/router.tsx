import { createHashRouter } from 'react-router'
import TabLayout from './components/TabLayout'
import CalendarEventPage from './pages/CalendarEventPage'
import CalendarPage from './pages/CalendarPage'
import CycleEditPage from './pages/CycleEditPage'
import CyclesPage from './pages/CyclesPage'
import EditPage from './pages/EditPage'
import RootLayout from './components/RootLayout'
import ImportCapturePage from './pages/ImportCapturePage'
import InboxPage from './pages/InboxPage'
import ListPage from './pages/ListPage'
import MonthlyPage from './pages/MonthlyPage'
import NotFoundPage from './pages/NotFoundPage'
import SettingsPage from './pages/SettingsPage'
import StatsPage from './pages/StatsPage'
import { LIST_PATH } from './paths'

export const router = createHashRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <TabLayout />,
        children: [
          { path: '/', element: <CalendarPage /> },
          { path: '/cycles', element: <CyclesPage /> },
          { path: LIST_PATH, element: <ListPage /> },
          { path: '/stats', element: <StatsPage /> },
          { path: '/inbox', element: <InboxPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      { path: '/tx/new', element: <EditPage /> },
      { path: '/tx/:id', element: <EditPage /> },
      { path: '/monthly', element: <MonthlyPage /> },
      { path: '/cycles/new', element: <CycleEditPage /> },
      { path: '/cycles/:id', element: <CycleEditPage /> },
      { path: '/calendar/new', element: <CalendarEventPage /> },
      { path: '/calendar/event/:id', element: <CalendarEventPage /> },
      { path: '/import', element: <ImportCapturePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
