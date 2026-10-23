import { InfoIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

type FieldHintProps = {
  tone?: 'info' | 'error' | 'result'
  children: ReactNode
}

function FieldHint({ tone = 'info', children }: FieldHintProps) {
  return (
    <span className={`field-hint field-${tone}`}>
      {tone === 'info' && <InfoIcon className="field-hint-icon" aria-hidden="true" />}
      {tone === 'error' && <WarningCircleIcon className="field-hint-icon" aria-hidden="true" />}
      {children}
    </span>
  )
}

export default FieldHint
