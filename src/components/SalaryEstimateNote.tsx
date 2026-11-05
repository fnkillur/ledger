import { QuestionIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { usePersonName } from '../db/hooks'
import type { PendingSalary } from '../domain/stats'
import { useBackHandler } from '../navigation/back'

// 수입 대비 지출이 예상치일 때 붙이는 표시. 어느 월급을 기다리는지는 ? 를 눌러야 보인다.
function SalaryEstimateNote({ pending }: { pending: PendingSalary[] }) {
  const personName = usePersonName()

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
    <span ref={noteRef} className="estimate-note">
      지난달 월급 기준
      <button type="button" className="estimate-help" aria-label="기다리는 월급 보기" aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)}>
        <QuestionIcon size={14} weight="bold" aria-hidden="true" />
      </button>
      {isOpen && (
        <span role="tooltip" className="estimate-tooltip">
          아직 안 들어온 월급은 지난달 금액으로 셌어요
          <br />
          월급 예정 {pending.map(salary => `${personName(salary.person)} ${salary.day}일`).join(' · ')}
        </span>
      )}
    </span>
  )
}

export default SalaryEstimateNote
