import { CaretLeftIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

type TopBarProps = {
  title?: ReactNode
  showBack?: boolean
  onBack?: () => void
  actions?: ReactNode
}

function TopBar({ title, showBack = false, onBack, actions }: TopBarProps) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }
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
          <CaretLeftIcon size={24} weight="bold" aria-hidden="true" />
        </button>
      )}
      <h1 className="top-bar-title">{title}</h1>
      <div className="top-bar-actions">{actions}</div>
    </header>
  )
}

export default TopBar
