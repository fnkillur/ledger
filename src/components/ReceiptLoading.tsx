import { XIcon } from '@phosphor-icons/react'
import { Fragment, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBackHandler } from '../navigation/back'

// 보통 몇 초면 읽는데, 이보다 오래 걸리면 서버가 붐비는 것이라 그만둘 수 있게 한다.
export const CANCEL_OFFER_DELAY_MS = 8000

const toSentences = (message: string) => message.split(/(?<=[.!?])\s+/).filter(Boolean)

type ReceiptLoadingProps = {
  errorMessage?: string
  onRetry: () => void
  onCancel: () => void
}

// 영수증을 읽는 동안 입력 화면을 가려서, 결과가 채워지기 전에 다른 값을 고치지 않게 한다.
function ReceiptLoading({ errorMessage, onRetry, onCancel }: ReceiptLoadingProps) {
  useBackHandler(onCancel)

  const [isSlow, setIsSlow] = useState(false)

  const isFailed = errorMessage !== undefined

  useEffect(() => {
    if (isFailed) return
    const timer = setTimeout(() => setIsSlow(true), CANCEL_OFFER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isFailed])

  return createPortal(
    <div className="receipt-loading" role="dialog" aria-modal="true" aria-label={isFailed ? '영수증 읽기 실패' : '영수증 읽는 중'}>
      <header className="receipt-loading-header">
        <button type="button" className="icon-button receipt-loading-close" aria-label="닫기" onClick={onCancel}>
          <XIcon size={24} weight="bold" aria-hidden="true" />
        </button>
      </header>
      <div className="receipt-loading-body">
        <video
          className="receipt-loading-video"
          src={`${import.meta.env.BASE_URL}receipt-loading.mp4`}
          poster={`${import.meta.env.BASE_URL}receipt-loading.jpg`}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
        />
        {isFailed ? (
          <>
            <h2 className="receipt-loading-title">영수증을 읽지 못했어요</h2>
            <p className="receipt-loading-message">
              {toSentences(errorMessage).map((sentence, index) => (
                <Fragment key={sentence}>
                  {index > 0 && <br />}
                  {sentence}
                </Fragment>
              ))}
            </p>
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
            <h2 className="receipt-loading-title">영수증을 읽고 있어요</h2>
            <p className="receipt-loading-message">
              품목을 카테고리별로 나누는 중이에요.
              <br />
              잠시만 기다려 주세요.
            </p>
            {/* 취소 버튼이 나타날 때 영상과 문구가 밀려 올라가지 않도록 자리를 미리 잡아 둔다. */}
            <div className="receipt-loading-actions is-reserved">
              {isSlow && (
                <>
                  <p className="receipt-loading-hint">평소보다 오래 걸리고 있어요.</p>
                  <button type="button" className="button" onClick={onCancel}>
                    취소
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default ReceiptLoading
