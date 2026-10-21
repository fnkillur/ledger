import type { ReactNode } from 'react'
import Sticker, { type StickerName } from './Sticker'

type EmptyStateProps = {
  sticker: StickerName
  children: ReactNode
}

function EmptyState({ sticker, children }: EmptyStateProps) {
  return (
    <div className="sticker-empty">
      <Sticker name={sticker} size={120} />
      <div className="sticker-empty-text">{children}</div>
    </div>
  )
}

export default EmptyState
