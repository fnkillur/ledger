import { CameraIcon, CaretRightIcon, ChatCircleTextIcon, PencilSimpleLineIcon, PlusIcon, type Icon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

type AddOption = { to: string; title: string; description: string; Glyph: Icon; tone: string }

const ADD_OPTIONS: AddOption[] = [
  { to: '/tx/new', title: '직접 입력', description: '한 건씩 바로 기록', Glyph: PencilSimpleLineIcon, tone: 'blue' },
  { to: '/import', title: '카톡 알림 캡처', description: '카드사 알림톡 캡처로 여러 건 한꺼번에', Glyph: ChatCircleTextIcon, tone: 'yellow' },
  { to: '/monthly', title: '토스 월 합계', description: '토스 캡처로 한 달 치 카테고리별 금액', Glyph: CameraIcon, tone: 'green' },
]

// 기록하는 방법이 여러 가지라 + 버튼 하나에서 고르게 한다.
function AddMenu() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return (
    <>
      <button type="button" className="fab" aria-label="기록하기" aria-expanded={isOpen} onClick={() => setIsOpen(true)}>
        <PlusIcon size={26} weight="bold" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="sheet-backdrop add-menu-backdrop" onClick={() => setIsOpen(false)}>
          <nav className="sheet add-menu" aria-label="기록 방법" onClick={event => event.stopPropagation()}>
            <h2 className="add-menu-title">어떻게 기록할까요?</h2>
            <ul className="add-menu-list">
              {ADD_OPTIONS.map(({ to, title, description, Glyph, tone }) => (
                <li key={to}>
                  <Link to={to} className="add-menu-item">
                    <span className={`add-menu-icon tone-${tone}`}>
                      <Glyph size={24} weight="duotone" aria-hidden="true" />
                    </span>
                    <span className="add-menu-text">
                      <strong>{title}</strong>
                      <span>{description}</span>
                    </span>
                    <CaretRightIcon size={16} weight="bold" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </>
  )
}

export default AddMenu
