import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'

type MoreToggleProps = {
  total: number
  collapsedCount?: number
  isExpanded: boolean
  onToggle: () => void
}

function MoreToggle({ total, collapsedCount = 5, isExpanded, onToggle }: MoreToggleProps) {
  if (total <= collapsedCount) return null
  return (
    <button type="button" className="text-button more-toggle" onClick={onToggle}>
      {isExpanded ? '접기' : `${total - collapsedCount}개 더 보기`}
      {isExpanded ? <CaretUpIcon size={14} weight="bold" aria-hidden="true" /> : <CaretDownIcon size={14} weight="bold" aria-hidden="true" />}
    </button>
  )
}

export default MoreToggle
