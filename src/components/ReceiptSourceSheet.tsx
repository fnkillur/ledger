import { CameraIcon, ImagesIcon } from '@phosphor-icons/react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useBackHandler } from '../navigation/back'

type ReceiptSourceSheetProps = {
  onPick: (file: File) => void
  onClose: () => void
}

// 영수증 사진을 카메라로 바로 찍을지 갤러리에서 고를지 정한다.
function ReceiptSourceSheet({ onPick, onClose }: ReceiptSourceSheetProps) {
  useBackHandler(onClose)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    onClose()
    onPick(file)
  }

  return createPortal(
    <div className="sheet-backdrop add-menu-backdrop" onClick={onClose}>
      <div className="sheet add-menu" role="dialog" aria-label="영수증 올리기" onClick={event => event.stopPropagation()}>
        <h2 className="add-menu-title">영수증 올리기</h2>
        <div className="receipt-source">
          <label className="receipt-source-option">
            <input type="file" accept="image/*" capture="environment" hidden onChange={handleChange} />
            <CameraIcon size={32} weight="duotone" aria-hidden="true" />
            <strong>카메라</strong>
            <span>지금 바로 찍기</span>
          </label>
          <label className="receipt-source-option">
            <input type="file" accept="image/*" hidden onChange={handleChange} />
            <ImagesIcon size={32} weight="duotone" aria-hidden="true" />
            <strong>갤러리</strong>
            <span>찍어 둔 사진 고르기</span>
          </label>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default ReceiptSourceSheet
