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
        <TabLink to="/" label="내역" icon="M4 6h16M4 12h16M4 18h10" end />
        <TabLink to="/stats" label="통계" icon="M5 20V11M12 20V5M19 20v-7" />
        {!IS_WEB_BUILD && (
          <TabLink to="/inbox" label="수집함" icon="M4 13l3-8h10l3 8v6H4zM4 13h5l1 2h4l1-2h5" badge={inboxCount} />
        )}
        <TabLink to="/settings" label="설정" icon="M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4" />
      </nav>
    </>
  )
}

type TabLinkProps = {
  to: string
  label: string
  icon: string
  badge?: number
  end?: boolean
}

function TabLink({ to, label, icon, badge = 0, end }: TabLinkProps) {
  return (
    <NavLink to={to} end={end} className="tab-link">
      <span className="tab-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d={icon} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {badge > 0 && <span className="tab-badge">{badge > 99 ? '99+' : badge}</span>}
      </span>
      <span>{label}</span>
    </NavLink>
  )
}

export default TabLayout
