import { ChartBarIcon, GearSixIcon, ListBulletsIcon, TrayIcon, type Icon } from '@phosphor-icons/react'
import { NavLink, Outlet } from 'react-router'
import { usePendingCaptures, useUncategorized } from '../db/hooks'
import { IS_WEB_BUILD } from '../platform'

function TabLayout() {
  const captures = usePendingCaptures()
  const uncategorized = useUncategorized()

  const inboxCount = captures.filter(capture => capture.status === '대기').length + uncategorized.length

  return (
    <>
      <Outlet />
      <nav className="tab-bar" aria-label="주요 메뉴">
        <TabLink to="/" label="내역" icon={ListBulletsIcon} end />
        <TabLink to="/stats" label="통계" icon={ChartBarIcon} />
        {!IS_WEB_BUILD && (
          <TabLink to="/inbox" label="수집함" icon={TrayIcon} badge={inboxCount} />
        )}
        <TabLink to="/settings" label="설정" icon={GearSixIcon} />
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
}

function TabLink({ to, label, icon: TabIcon, badge = 0, end }: TabLinkProps) {
  return (
    <NavLink to={to} end={end} className="tab-link">
      {({ isActive }) => (
        <>
          <span className="tab-icon">
            <TabIcon size={24} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />
            {badge > 0 && <span className="tab-badge">{badge > 99 ? '99+' : badge}</span>}
          </span>
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default TabLayout
