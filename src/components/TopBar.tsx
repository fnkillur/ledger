import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

type TopBarProps = {
  title?: ReactNode
  showBack?: boolean
  actions?: ReactNode
}

function TopBar({ title, showBack = false, actions }: TopBarProps) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <header className="top-bar">
      {showBack && (
        <button type="button" className="icon-button" onClick={handleBack} aria-label="뒤로">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <h1 className="top-bar-title">{title}</h1>
      <div className="top-bar-actions">{actions}</div>
    </header>
  )
}

export default TopBar
