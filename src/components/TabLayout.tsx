import { CalendarBlankIcon, ChartBarIcon, GearSixIcon, ListBulletsIcon, TrayIcon, type Icon } from '@phosphor-icons/react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { usePendingCaptures, useUncategorized } from '../db/hooks'
import { LIST_PATH } from '../paths'
import { IS_WEB_BUILD } from '../platform'
import { currentMonthKey } from '../utils/format'
import { setCalendarMonth } from '../utils/viewState'

// 폴드를 펼치면 화면이 넓어 왼쪽 끝이 엄지에 닿지 않아서, 안드로이드 앱은 자주 가는 캘린더를 오른쪽 끝에 둔다.
const orderTabs = (tabs: TabLinkProps[]) => (IS_WEB_BUILD ? tabs : [...tabs].reverse())

function TabLayout() {
  const location = useLocation()

  const captures = usePendingCaptures()
  const uncategorized = useUncategorized()

  const inboxCount = captures.filter(capture => capture.status === '대기').length + uncategorized.length

  const tabs: TabLinkProps[] = [
    {
      to: '/',
      label: '캘린더',
      icon: CalendarBlankIcon,
      end: true,
      isAlsoActive: location.pathname === '/cycles',
      onClick: () => setCalendarMonth(currentMonthKey()),
    },
    { to: LIST_PATH, label: '내역', icon: ListBulletsIcon },
    { to: '/stats', label: '통계', icon: ChartBarIcon },
    { to: '/inbox', label: '수집함', icon: TrayIcon, badge: inboxCount },
    { to: '/settings', label: '설정', icon: GearSixIcon },
  ]

  return (
    <>
      <Outlet />
      <nav className="tab-bar" aria-label="주요 메뉴">
        {orderTabs(tabs).map(tab => (
          <TabLink key={tab.to} {...tab} />
        ))}
      </nav>
    </>
  )
}

type TabLinkProps = {
  to: string
  label: string
  icon: Icon
  badge?: number
  end?: boolean
  // 캘린더 탭 안의 주기 화면처럼, 다른 주소여도 같은 탭으로 보여야 할 때.
  isAlsoActive?: boolean
  onClick?: () => void
}

function TabLink({ to, label, icon: TabIcon, badge = 0, end, isAlsoActive = false, onClick }: TabLinkProps) {
  return (
    <NavLink to={to} end={end} replace className={({ isActive }) => `tab-link${isActive || isAlsoActive ? ' active' : ''}`} onClick={onClick}>
      {({ isActive }) => (
        <>
          <span className="tab-icon">
            <TabIcon size={24} weight={isActive || isAlsoActive ? 'fill' : 'regular'} aria-hidden="true" />
            {badge > 0 && <span className="tab-badge">{badge > 99 ? '99+' : badge}</span>}
          </span>
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default TabLayout
