import { Link } from 'react-router'
import { myShare } from '../domain/stats'
import type { Transaction } from '../domain/types'
import { formatSignedWon, formatTime } from '../utils/format'

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const share = myShare(transaction)
  const title = transaction.merchant || transaction.category || '내역 없음'

  return (
    <li>
      <Link to={`/tx/${transaction.id}`} className={`tx-row${transaction.excluded ? ' is-excluded' : ''}`}>
        <div className="tx-row-main">
          <strong className="tx-row-title">{title}</strong>
          <span className="tx-row-meta">
            {transaction.category || '카테고리 없음'} · {transaction.person} · {formatTime(transaction.occurredAt)}
            {transaction.excluded && ' · 통계 제외'}
          </span>
        </div>
        <div className="tx-row-amount">
          <span className={`amount amount-${transaction.kind}`}>{formatSignedWon(share, transaction.kind)}</span>
          {transaction.shareCount > 1 && (
            <span className="tx-row-share">
              {transaction.amount.toLocaleString('ko-KR')}원 ÷ {transaction.shareCount}
            </span>
          )}
        </div>
      </Link>
    </li>
  )
}

export default TransactionRow
