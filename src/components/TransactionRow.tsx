import { Link } from 'react-router'
import { useCategoryIcons, usePersonName } from '../db/hooks'
import { myShare } from '../domain/stats'
import type { Transaction } from '../domain/types'
import { formatSignedWon, formatTime } from '../utils/format'
import CategoryIcon from './CategoryIcon'
import PersonAvatar from './PersonAvatar'

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const icons = useCategoryIcons()
  const personName = usePersonName()

  const share = myShare(transaction)
  const category = transaction.category || '카테고리 없음'
  const title = transaction.merchant || category

  return (
    <li>
      <Link to={`/tx/${transaction.id}`} className={`tx-row${transaction.excluded ? ' is-excluded' : ''}`}>
        <CategoryIcon name={category} emoji={icons.get(category)} size={20} />
        <div className="tx-row-main">
          <strong className="tx-row-title">{title}</strong>
          <span className="tx-row-meta">
            <span className="tx-row-person">
              <PersonAvatar person={transaction.person} size={16} />
              {personName(transaction.person)}
            </span>
            <span className="tx-row-category">{category}</span>
            {transaction.kind === '지출' && transaction.scope === '개인' && <span className="tx-badge">개인</span>}
            {transaction.shareCount > 1 && <span className="tx-badge">{transaction.shareCount}명 나눔</span>}
            {transaction.excluded && <span className="tx-badge">통계 제외</span>}
          </span>
        </div>
        <div className="tx-row-amount">
          <span className={`amount amount-${transaction.kind}`}>{formatSignedWon(share, transaction.kind)}</span>
          <span className="tx-row-time">{formatTime(transaction.occurredAt)}</span>
        </div>
      </Link>
    </li>
  )
}

export default TransactionRow
