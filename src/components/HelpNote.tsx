import { QuestionIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBackHandler } from '../navigation/back'

type HelpNoteProps = { label: ReactNode; helpLabel: string; className?: string; children: ReactNode }

// 짧은 표시 옆의 ? 를 누르면 설명 말풍선이 열린다. 바깥을 누르거나 뒤로 가기로 닫는다.
function HelpNote({ label, helpLabel, className, children }: HelpNoteProps) {
  const noteRef = useRef<HTMLSpanElement>(null)

  const [isOpen, setIsOpen] = useState(false)

  useBackHandler(() => setIsOpen(false), isOpen)

  useEffect(() => {
    if (!isOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!noteRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [isOpen])

  return (
    <span ref={noteRef} className={`estimate-note${className ? ` ${className}` : ''}`}>
      {label}
      <button type="button" className="estimate-help" aria-label={helpLabel} aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)}>
        <QuestionIcon size={14} weight="bold" aria-hidden="true" />
      </button>
      {isOpen && (
        <span role="tooltip" className="estimate-tooltip">
          {children}
        </span>
      )}
    </span>
  )
}

export default HelpNote
