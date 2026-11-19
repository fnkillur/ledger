import { createPortal } from 'react-dom'
import { useBackHandler } from '../navigation/back'

type ReceiptLoadingProps = {
  errorMessage?: string
  onRetry: () => void
  onCancel: () => void
}

// 영수증을 읽는 동안 입력 화면을 가려서, 결과가 채워지기 전에 다른 값을 고치지 않게 한다.
function ReceiptLoading({ errorMessage, onRetry, onCancel }: ReceiptLoadingProps) {
  useBackHandler(onCancel)

  const isFailed = errorMessage !== undefined

  return createPortal(
    <div className="receipt-loading" role="dialog" aria-modal="true" aria-label={isFailed ? '영수증 읽기 실패' : '영수증 읽는 중'}>
      <video className="receipt-loading-video" src={`${import.meta.env.BASE_URL}receipt-loading.mp4`} autoPlay loop muted playsInline aria-hidden="true" />
      {isFailed ? (
        <>
          <p className="receipt-loading-title">영수증을 읽지 못했어요</p>
          <p className="receipt-loading-message">{errorMessage}</p>
          <div className="receipt-loading-actions">
            <button type="button" className="button button-primary" onClick={onRetry}>
              다시 시도
            </button>
            <button type="button" className="button" onClick={onCancel}>
              직접 입력하기
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="receipt-loading-title">영수증을 읽고 있어요</p>
          <p className="receipt-loading-message">품목을 카테고리별로 나누는 중이에요. 잠시만 기다려 주세요.</p>
        </>
      )}
    </div>,
    document.body,
  )
}

export default ReceiptLoading
