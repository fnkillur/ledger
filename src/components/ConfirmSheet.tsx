type ConfirmSheetProps = {
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmSheet({ message, confirmLabel, onConfirm, onCancel }: ConfirmSheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" role="alertdialog" aria-label={message} onClick={event => event.stopPropagation()}>
        <p className="sheet-message">{message}</p>
        <div className="sheet-actions">
          <button type="button" className="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="button button-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmSheet
